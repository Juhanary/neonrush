/**
 * Synth voices and the mix bus. Everything is synthesised (no audio files) and written against
 * BaseAudioContext, so the same code runs live and in an OfflineAudioContext (scripts/audio.mjs
 * renders songs offline to check levels and balance).
 *
 * Signal flow:
 *   drums ───────────────┐
 *   inst ── duck (kick) ─┤
 *   reverb / delay sends ┼─ music ─ filter (flip-zone muffle) ─┐
 *   sfx ───────────────────────────────────────────────────────┴─ compressor ─ master ─ limiter ─ out
 */
export const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

export type BassKind = 'sub' | 'pluck' | 'reese' | 'acid' | 'wobble' | 'grit' | 'fm' | 'growl';
export type LeadKind = 'square' | 'saw' | 'bell' | 'tri' | 'grit' | 'fm' | 'hollow';

export class Mix {
  readonly master: GainNode;
  readonly music: GainNode;
  readonly filter: BiquadFilterNode;
  readonly drums: GainNode;
  readonly inst: GainNode;
  readonly duck: GainNode;
  readonly rev: GainNode;
  readonly dly: GainNode;
  readonly sfx: GainNode;
  readonly noise: AudioBuffer;
  private delay: DelayNode;

  constructor(readonly ctx: BaseAudioContext, out: AudioNode = ctx.destination) {
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.08;
    limiter.connect(out);
    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(limiter);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 3.5; comp.attack.value = 0.006; comp.release.value = 0.16;
    comp.connect(this.master);

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass'; this.filter.frequency.value = 20000; this.filter.Q.value = 0.7;
    this.filter.connect(comp);
    this.music = ctx.createGain();
    this.music.gain.value = 0;
    this.music.connect(this.filter);

    this.drums = ctx.createGain(); this.drums.gain.value = 0.9; this.drums.connect(this.music);
    this.duck = ctx.createGain(); this.duck.connect(this.music);
    this.inst = ctx.createGain(); this.inst.gain.value = 1.0; this.inst.connect(this.duck);

    // reverb: a short generated room, darker towards the tail
    const len = Math.floor(ctx.sampleRate * 1.5);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const k = i / len;
        lp += ((Math.random() * 2 - 1) - lp) * (0.75 - 0.6 * k);
        d[i] = lp * Math.pow(1 - k, 2.6);
      }
    }
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    this.rev = ctx.createGain(); this.rev.gain.value = 1;
    const revOut = ctx.createGain(); revOut.gain.value = 0.55;
    this.rev.connect(conv).connect(revOut).connect(this.duck);

    // tempo delay with a darkening feedback loop
    this.delay = ctx.createDelay(1.5);
    this.delay.delayTime.value = 0.375;
    const fb = ctx.createGain(); fb.gain.value = 0.36;
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 2600;
    this.dly = ctx.createGain(); this.dly.gain.value = 1;
    this.dly.connect(this.delay);
    this.delay.connect(tone).connect(fb).connect(this.delay);
    const dlyOut = ctx.createGain(); dlyOut.gain.value = 0.5;
    tone.connect(dlyOut).connect(this.duck);

    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.8; this.sfx.connect(comp);

    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const n = this.noise.getChannelData(0);
    for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;
  }

  /** Delay time follows the tempo: three sixteenths (a dotted eighth). */
  setStep(stepSeconds: number): void {
    this.delay.delayTime.setTargetAtTime(Math.min(1.4, stepSeconds * 3), this.ctx.currentTime, 0.05);
  }

  /** Reversed gravity pushes the music "underwater"; leaving the zone opens it up again. */
  muffle(on: boolean, glide = 0.12): void {
    const t = this.ctx.currentTime, f = this.filter;
    f.frequency.cancelScheduledValues(t);
    f.frequency.setTargetAtTime(on ? 900 : 20000, t, glide);
    f.Q.setTargetAtTime(on ? 5 : 0.7, t, glide);
  }
}

/** Every instrument. Times are AudioContext seconds, notes are MIDI numbers, `v` is velocity 0..1. */
export class Voices {
  private ctx: BaseAudioContext;
  private flip = 1;
  private curves = new Map<number, Float32Array<ArrayBuffer>>();
  constructor(readonly mix: Mix) { this.ctx = mix.ctx; }

  // ---- building blocks ----------------------------------------------------
  private osc(type: OscillatorType, freq: number, t: number, end: number, cents = 0): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (cents) o.detune.setValueAtTime(cents, t);
    o.start(t); o.stop(end);
    return o;
  }
  /** Gain node with attack, decay to a sustain level, and release after `dur`. */
  private amp(t: number, peak: number, a: number, d: number, sus: number, dur: number, r: number): GainNode {
    const g = this.ctx.createGain();
    const p = g.gain;
    const hold = Math.max(dur, a + 0.005);
    p.setValueAtTime(0.0001, t);
    p.linearRampToValueAtTime(peak, t + a);
    p.exponentialRampToValueAtTime(Math.max(0.0001, peak * sus), Math.min(t + a + d, t + hold));
    p.setValueAtTime(Math.max(0.0001, peak * sus), t + hold);
    p.exponentialRampToValueAtTime(0.0001, t + hold + r);
    return g;
  }
  private lp(t: number, from: number, to: number, time: number, q = 1): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.Q.value = q;
    f.frequency.setValueAtTime(from, t);
    if (to !== from) f.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + time);
    return f;
  }
  private burst(t: number, dur: number, peak: number, type: BiquadFilterType, freq: number, q = 0.7, sweep = 0): GainNode {
    const s = this.ctx.createBufferSource();
    s.buffer = this.mix.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g);
    s.start(t, Math.random() * 0.6); s.stop(t + dur + 0.03);
    return g;
  }
  /** Soft-clipping distortion. The output never exceeds 1, so the level after it is set by the amp alone. */
  private drive(amount: number): WaveShaperNode {
    let c = this.curves.get(amount);
    if (!c) {
      c = new Float32Array(1025);
      const norm = Math.tanh(amount);
      for (let i = 0; i < c.length; i++) c[i] = Math.tanh(amount * (i / 512 - 1)) / norm;
      this.curves.set(amount, c);
    }
    const w = this.ctx.createWaveShaper();
    w.curve = c;
    w.oversample = '2x';
    return w;
  }
  private pan(node: AudioNode, p: number, to: AudioNode): void {
    const c = this.ctx as BaseAudioContext & { createStereoPanner?: () => StereoPannerNode };
    if (p !== 0 && c.createStereoPanner) {
      const sp = c.createStereoPanner();
      sp.pan.value = p;
      node.connect(sp).connect(to);
    } else node.connect(to);
  }
  private send(node: AudioNode, to: AudioNode, level: number): void {
    if (level <= 0) return;
    const g = this.ctx.createGain();
    g.gain.value = level;
    node.connect(g).connect(to);
  }

  // ---- drums --------------------------------------------------------------
  /** Kick. Also ducks every pitched instrument for a moment, which is what makes the mix pump. */
  kick(t: number, v = 1, duck = 0.2, hard = false): void {
    const o = this.osc('sine', hard ? 210 : 170, t, t + 0.4);
    o.frequency.exponentialRampToValueAtTime(hard ? 43 : 46, t + (hard ? 0.09 : 0.11));
    const g = this.amp(t, v, 0.002, 0.3, 0.001, 0.02, 0.3);
    if (hard) {
      // saturated: the sine is pushed into the clipper, which squares it off and adds a knock
      const pre = this.ctx.createGain();
      pre.gain.value = 2.6;
      const post = this.ctx.createGain();
      post.gain.value = 0.8;
      o.connect(pre).connect(this.drive(2.5)).connect(g).connect(post).connect(this.mix.drums);
      this.burst(t, 0.03, v * 0.2, 'bandpass', 3200, 0.8).connect(this.mix.drums);
    } else o.connect(g).connect(this.mix.drums);
    const c = this.osc('triangle', 1100, t, t + 0.05);
    c.frequency.exponentialRampToValueAtTime(180, t + 0.025);
    c.connect(this.amp(t, v * 0.32, 0.001, 0.03, 0.001, 0.005, 0.02)).connect(this.mix.drums);
    const d = this.mix.duck.gain;
    d.cancelScheduledValues(t);
    d.setValueAtTime(0.3, t);
    d.linearRampToValueAtTime(1, t + duck);
  }
  snare(t: number, v = 1, hard = false): void {
    const n = this.burst(t, hard ? 0.26 : 0.19, v * 0.5, 'bandpass', hard ? 1900 : 2300, 0.6);
    n.connect(this.mix.drums);
    this.send(n, this.mix.rev, hard ? 0.55 : 0.3);
    if (hard) {
      // a metallic ring under the noise: two squares a non-harmonic interval apart
      const ring = this.amp(t, v * 0.09, 0.001, 0.07, 0.001, 0.01, 0.05);
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 1.2;
      this.osc('square', 331, t, t + 0.12).connect(bp);
      this.osc('square', 487, t, t + 0.12).connect(bp);
      bp.connect(ring).connect(this.mix.drums);
    }
    const o = this.osc('triangle', 215, t, t + 0.14);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.09);
    o.connect(this.amp(t, v * 0.38, 0.001, 0.1, 0.001, 0.01, 0.06)).connect(this.mix.drums);
  }
  clap(t: number, v = 1): void {
    for (const [dt, len, k] of [[0, 0.012, 0.7], [0.011, 0.012, 0.8], [0.023, 0.16, 1]] as const) {
      const n = this.burst(t + dt, len, v * 0.42 * k, 'bandpass', 1350, 1.1);
      n.connect(this.mix.drums);
      this.send(n, this.mix.rev, 0.35);
    }
  }
  hat(t: number, v = 1, open = false): void {
    this.flip = -this.flip;
    this.pan(this.burst(t, open ? 0.24 : 0.045, v * 0.3, 'highpass', open ? 7000 : 8500), this.flip * 0.25, this.mix.drums);
  }
  perc(t: number, v = 1, freq = 520, hard = false): void {
    if (hard) {
      // struck metal instead of a tom
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = freq * 4.2; bp.Q.value = 3;
      this.osc('square', freq * 1.5, t, t + 0.1).connect(bp);
      this.osc('square', freq * 2.23, t, t + 0.1).connect(bp);
      this.pan(bp.connect(this.amp(t, v * 0.2, 0.001, 0.05, 0.001, 0.006, 0.04)), -this.flip * 0.4, this.mix.drums);
      return;
    }
    const o = this.osc('sine', freq, t, t + 0.12);
    o.frequency.exponentialRampToValueAtTime(freq * 0.55, t + 0.08);
    this.pan(o.connect(this.amp(t, v * 0.3, 0.001, 0.08, 0.001, 0.01, 0.04)), -this.flip * 0.4, this.mix.drums);
  }
  crash(t: number, v = 1): void {
    const n = this.burst(t, 1.3, v * 0.22, 'highpass', 5200);
    n.connect(this.mix.drums);
    this.send(n, this.mix.rev, 0.5);
  }
  /** Noise sweep that swells up to `t + dur` (plays before a section that steps up). */
  riser(t: number, dur: number, v = 1): void {
    const s = this.ctx.createBufferSource();
    s.buffer = this.mix.noise; s.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 1.6;
    f.frequency.setValueAtTime(350, t);
    f.frequency.exponentialRampToValueAtTime(7500, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v * 0.26, t + dur);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.03);
    s.connect(f).connect(g).connect(this.mix.drums);
    s.start(t); s.stop(t + dur + 0.05);
  }

  // ---- pitched ------------------------------------------------------------
  bass(note: number, t: number, dur: number, v: number, kind: BassKind, rateHz = 4): void {
    const f0 = mtof(note), end = t + dur + 0.2, out = this.mix.inst;
    if (kind === 'sub' || kind === 'reese') {
      const sub = this.osc('sine', f0, t, end);
      sub.connect(this.amp(t, v * (kind === 'reese' ? 0.3 : 0.55), 0.006, 0.1, 0.8, dur, 0.06)).connect(out);
    }
    if (kind === 'sub') {
      const s = this.osc('sawtooth', f0, t, end);
      s.connect(this.lp(t, 1100, 260, Math.min(dur, 0.25), 2)).connect(this.amp(t, v * 0.3, 0.004, 0.12, 0.6, dur, 0.05)).connect(out);
    } else if (kind === 'pluck') {
      const f = this.lp(t, 2400, 240, 0.16, 3);
      this.osc('sawtooth', f0, t, end).connect(f);
      this.osc('square', f0 * 2, t, end, 6).connect(f);
      f.connect(this.amp(t, v * 0.36, 0.003, 0.14, 0.3, dur, 0.05)).connect(out);
      this.osc('sine', f0, t, end).connect(this.amp(t, v * 0.4, 0.004, 0.1, 0.7, dur, 0.05)).connect(out);
    } else if (kind === 'reese') {
      const f = this.lp(t, 520, 520, 0.1, 3.5);
      for (const c of [-16, 16]) this.osc('sawtooth', f0 * 2, t, end, c).connect(f);
      f.connect(this.amp(t, v * 0.26, 0.02, 0.1, 0.9, dur, 0.08)).connect(out);
    } else if (kind === 'acid') {
      const f = this.lp(t, 500 + 2600 * v, 240, Math.max(0.09, dur), 13);
      this.osc('sawtooth', f0, t, end).connect(f);
      f.connect(this.amp(t, 0.24 + 0.16 * v, 0.004, 0.1, 0.5, dur, 0.04)).connect(out);
      this.osc('sine', f0, t, end).connect(this.amp(t, 0.32, 0.004, 0.1, 0.6, dur, 0.04)).connect(out);
    } else if (kind === 'grit') {
      // distorted saw: the filter envelope opens into the clipper, a clean sine carries the low end
      const f = this.lp(t, 320 + 1900 * v, 360, Math.min(0.22, dur + 0.05), 4);
      this.osc('sawtooth', f0, t, end).connect(f);
      this.osc('square', f0, t, end, 7).connect(f);
      const pre = this.ctx.createGain();
      pre.gain.value = 1.6;
      f.connect(pre).connect(this.drive(3)).connect(this.amp(t, v * 0.2, 0.003, 0.12, 0.55, dur, 0.04)).connect(out);
      this.osc('sine', f0, t, end).connect(this.amp(t, v * 0.33, 0.004, 0.1, 0.7, dur, 0.05)).connect(out);
    } else if (kind === 'fm') {
      // metallic FM bass: the modulation index falls quickly, so every note barks and then hums
      const car = this.osc('sine', f0, t, end);
      const mod = this.osc('sine', f0 * 2, t, end);
      const idx = this.ctx.createGain();
      idx.gain.setValueAtTime(f0 * 4.5, t);
      idx.gain.exponentialRampToValueAtTime(f0 * 0.5, t + 0.16);
      mod.connect(idx).connect(car.frequency);
      car.connect(this.lp(t, 2600, 2600, 0.1, 0.7)).connect(this.amp(t, v * 0.3, 0.003, 0.12, 0.6, dur, 0.05)).connect(out);
      this.osc('sine', f0, t, end).connect(this.amp(t, v * 0.3, 0.004, 0.1, 0.7, dur, 0.05)).connect(out);
    } else if (kind === 'growl') {
      // detuned saws through a moving filter into the clipper: a reese that snarls
      const f = this.lp(t, 620, 620, 0.1, 5);
      const lfo = this.osc('sine', rateHz * 2, t, end);
      const depth = this.ctx.createGain();
      depth.gain.value = 380;
      lfo.connect(depth).connect(f.frequency);
      for (const c of [-22, 22]) this.osc('sawtooth', f0, t, end, c).connect(f);
      this.osc('square', f0 * 2, t, end, 5).connect(f);
      const pre = this.ctx.createGain();
      pre.gain.value = 1.4;
      f.connect(pre).connect(this.drive(4)).connect(this.amp(t, v * 0.15, 0.012, 0.1, 0.9, dur, 0.06)).connect(out);
      this.osc('sine', f0, t, end).connect(this.amp(t, v * 0.36, 0.006, 0.1, 0.8, dur, 0.05)).connect(out);
    } else {
      // wobble: saw + square through a filter swept by an LFO locked to the tempo
      const f = this.lp(t, 620, 620, 0.1, 8);
      const lfo = this.osc('sine', rateHz, t, end);
      const depth = this.ctx.createGain();
      depth.gain.value = 480;
      lfo.connect(depth).connect(f.frequency);
      this.osc('sawtooth', f0, t, end).connect(f);
      this.osc('square', f0 * 2, t, end, -8).connect(f);
      f.connect(this.amp(t, v * 0.25, 0.01, 0.1, 0.9, dur, 0.05)).connect(out);
      this.osc('sine', f0, t, end).connect(this.amp(t, v * 0.24, 0.006, 0.1, 0.8, dur, 0.05)).connect(out);
    }
  }

  /** Short bright note for arpeggios. */
  pluck(note: number, t: number, dur: number, v: number, bright = 3600, panTo = 0): void {
    const f0 = mtof(note), end = t + dur + 0.25;
    const f = this.lp(t, bright, 520, 0.14, 2.5);
    this.osc('sawtooth', f0, t, end).connect(f);
    this.osc('square', f0, t, end, 9).connect(f);
    const g = this.amp(t, v * 0.21, 0.003, 0.12, 0.25, dur, 0.12);
    f.connect(g);
    this.pan(g, panTo, this.mix.inst);
    this.send(g, this.mix.dly, 0.35);
    this.send(g, this.mix.rev, 0.15);
  }

  /** Warm sustained chord: two detuned saws per note, spread left and right. */
  pad(notes: number[], t: number, dur: number, v: number, cut = 1700): void {
    const end = t + dur + 0.5;
    const f = this.lp(t, cut * 0.6, cut, Math.min(dur * 0.5, 0.5), 0.8);
    const g = this.amp(t, v * 0.085, 0.07, 0.3, 0.8, dur, 0.3);
    notes.forEach((n, i) => {
      for (const c of [-9, 9]) {
        const o = this.osc('sawtooth', mtof(n), t, end, c + i);
        this.pan(o, c < 0 ? -0.5 : 0.5, f);
      }
    });
    f.connect(g).connect(this.mix.inst);
    this.send(g, this.mix.rev, 0.4);
  }

  /** Chord hit: supersaw with a fast filter drop. */
  stab(notes: number[], t: number, dur: number, v: number): void {
    const end = t + dur + 0.2;
    const f = this.lp(t, 5200, 900, Math.max(0.08, dur), 1.5);
    for (const n of notes) for (const c of [-12, 0, 12]) this.osc('sawtooth', mtof(n), t, end, c).connect(f);
    const g = this.amp(t, v * 0.06, 0.004, 0.1, 0.4, dur, 0.08);
    f.connect(g).connect(this.mix.inst);
    this.send(g, this.mix.rev, 0.3);
    this.send(g, this.mix.dly, 0.2);
  }

  lead(note: number, t: number, dur: number, v: number, kind: LeadKind, to: AudioNode = this.mix.inst): void {
    const f0 = mtof(note), end = t + dur + 0.6;
    if (kind === 'bell') { this.bell(note, t, v, to); return; }
    if (kind === 'fm') { this.fmLead(note, t, dur, v, to); return; }
    const vib = this.osc('sine', 5.6, t, end);
    const vd = this.ctx.createGain();
    vd.gain.setValueAtTime(0, t);
    vd.gain.linearRampToValueAtTime(dur > 0.22 ? 9 : 0, t + Math.max(0.2, dur * 0.6));
    vib.connect(vd);
    const f = kind === 'grit' ? this.lp(t, 5200, 1700, 0.3, 2) : kind === 'hollow' ? this.lp(t, 3200, 1500, 0.3, 1.5)
      : this.lp(t, kind === 'tri' ? 5000 : 4400, kind === 'saw' ? 2100 : 2600, 0.25, 1.2);
    const add = (type: OscillatorType, mul: number, cents: number, gain: number) => {
      const o = this.osc(type, f0 * mul, t, end, cents);
      vd.connect(o.detune);
      const g = this.ctx.createGain();
      g.gain.value = gain;
      o.connect(g).connect(f);
    };
    if (kind === 'square') { add('square', 1, 0, 0.5); add('sawtooth', 1, 11, 0.35); add('square', 2, -7, 0.14); }
    else if (kind === 'saw') { add('sawtooth', 1, -13, 0.36); add('sawtooth', 1, 0, 0.4); add('sawtooth', 1, 13, 0.36); add('sawtooth', 2, 5, 0.12); }
    else if (kind === 'grit') { add('sawtooth', 1, -17, 0.4); add('sawtooth', 1, 0, 0.45); add('sawtooth', 1, 17, 0.4); add('square', 0.5, 0, 0.3); }
    else if (kind === 'hollow') { add('square', 1, -7, 0.42); add('square', 1, 7, 0.42); add('triangle', 0.5, 0, 0.3); }
    else { add('triangle', 1, 0, 0.9); add('sine', 2, 4, 0.3); add('square', 1, -6, 0.1); }
    const g = this.amp(t, v * (kind === 'grit' ? 0.16 : kind === 'hollow' ? 0.25 : 0.27), 0.008, 0.15, 0.75, dur * 0.92, 0.09);
    if (kind === 'grit') {
      const pre = this.ctx.createGain();
      pre.gain.value = 1.5;
      f.connect(pre).connect(this.drive(2.5)).connect(g);
    } else f.connect(g);
    g.connect(to);
    this.send(g, this.mix.dly, 0.3);
    this.send(g, this.mix.rev, 0.28);
  }

  /** Sustained FM lead: bright and digital at the attack, rounder as the index falls. */
  private fmLead(note: number, t: number, dur: number, v: number, to: AudioNode): void {
    const f0 = mtof(note), end = t + dur + 0.4;
    const g = this.amp(t, v * 0.2, 0.006, 0.15, 0.7, dur * 0.92, 0.1);
    for (const cents of [-6, 6]) {
      const car = this.osc('sine', f0, t, end, cents);
      const mod = this.osc('sine', f0 * 2, t, end, cents);
      const idx = this.ctx.createGain();
      idx.gain.setValueAtTime(f0 * 3.2, t);
      idx.gain.exponentialRampToValueAtTime(f0 * 0.9, t + 0.28);
      mod.connect(idx).connect(car.frequency);
      this.pan(car, cents < 0 ? -0.3 : 0.3, g);
    }
    g.connect(to);
    this.send(g, this.mix.dly, 0.3);
    this.send(g, this.mix.rev, 0.25);
  }

  /** Glassy FM bell. */
  bell(note: number, t: number, v: number, to: AudioNode = this.mix.inst): void {
    const f0 = mtof(note), end = t + 1.2;
    const car = this.osc('sine', f0, t, end);
    const mod = this.osc('sine', f0 * 3.01, t, end);
    const idx = this.ctx.createGain();
    idx.gain.setValueAtTime(f0 * 2.2, t);
    idx.gain.exponentialRampToValueAtTime(f0 * 0.05, t + 0.35);
    mod.connect(idx).connect(car.frequency);
    const g = this.amp(t, v * 0.32, 0.002, 0.5, 0.05, 0.3, 0.6);
    car.connect(g).connect(to);
    this.send(g, this.mix.rev, 0.4);
    this.send(g, this.mix.dly, 0.25);
  }

  // ---- generic pieces for sound effects ------------------------------------
  /** Plain tone with a pitch glide. */
  tone(type: OscillatorType, f0: number, f1: number, t: number, dur: number, v: number, cutoff = 0, to: AudioNode = this.mix.sfx): void {
    const o = this.osc(type, f0, t, t + dur + 0.06);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = this.amp(t, v, 0.004, dur, 0.001, 0.01, 0.03);
    if (cutoff) o.connect(this.lp(t, cutoff, cutoff * 0.3, dur)).connect(g);
    else o.connect(g);
    g.connect(to);
  }
  hiss(t: number, dur: number, v: number, type: BiquadFilterType, freq: number, sweep = 0, to: AudioNode = this.mix.sfx): void {
    this.burst(t, dur, v, type, freq, 0.8, sweep).connect(to);
  }
}
