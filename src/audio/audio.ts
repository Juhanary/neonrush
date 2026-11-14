import type { SimEvent } from '../core/sim';

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

type Style = 'house' | 'breaks' | 'halftime' | 'dnb' | 'acid';
interface Song { style: Style; roots: number[]; chords: number[][]; lead: OscillatorType }
const MIN = [0, 3, 7], MAJ = [0, 4, 7];
/** One song per world, each in its own genre, key and tempo (tempo comes from the level). */
const SONGS: Song[] = [
  { style: 'house', roots: [45, 41, 48, 43], chords: [MIN, MAJ, MAJ, MAJ], lead: 'square' },      // A minor arpeggio house
  { style: 'breaks', roots: [50, 47, 43, 45], chords: [MAJ, MIN, MAJ, MAJ], lead: 'sawtooth' },   // D major supersaw breakbeat
  { style: 'halftime', roots: [40, 40, 41, 38], chords: [MIN, MIN, MAJ, MIN], lead: 'triangle' }, // E phrygian half-time wobble
  { style: 'dnb', roots: [41, 44, 39, 37], chords: [MIN, MAJ, MAJ, MAJ], lead: 'sine' },          // F minor drum and bass with bells
  { style: 'acid', roots: [45, 45, 43, 48], chords: [MIN, MIN, MAJ, MAJ], lead: 'sawtooth' },     // A minor acid techno
  { style: 'breaks', roots: [40, 43, 38, 47], chords: [MIN, MAJ, MAJ, MIN], lead: 'sawtooth' },   // E minor breakbeat, faster and darker
  { style: 'house', roots: [38, 46, 41, 36], chords: [MIN, MAJ, MAJ, MAJ], lead: 'sawtooth' },    // D minor saw-lead house
  { style: 'dnb', roots: [42, 38, 45, 40], chords: [MIN, MAJ, MAJ, MIN], lead: 'sine' },          // F# minor drum and bass
];

/** Fully synthesised music and effects (no audio files to load). */
export class GameAudio {
  private ctx?: AudioContext;
  private master!: GainNode;
  private music!: GainNode;
  private musicFilter!: BiquadFilterNode;
  private lastWarn = 0;
  private sfx!: GainNode;
  private delay!: DelayNode;
  private noise!: AudioBuffer;
  private playing = false;
  private step = 0;
  private nextTime = 0;
  private song = SONGS[0];
  private stepDur = 0.125;
  /** 0 normal, 1 past halfway, 2 record run: each level adds instrument layers. */
  hype = 0;
  private gemCombo = 0;
  private lastGem = 0;
  muted = false;

  /** Must be called from a user gesture. */
  unlock(): void {
    if (this.ctx) { void this.ctx.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      this.ctx = ctx;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 6;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(comp).connect(ctx.destination);
      this.musicFilter = ctx.createBiquadFilter(); this.musicFilter.type = 'lowpass'; this.musicFilter.frequency.value = 20000; this.musicFilter.Q.value = 1;
      this.musicFilter.connect(this.master);
      this.music = ctx.createGain(); this.music.gain.value = 0; this.music.connect(this.musicFilter);
      this.sfx = ctx.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
      this.delay = ctx.createDelay(1); this.delay.delayTime.value = 0.375;
      const fb = ctx.createGain(); fb.gain.value = 0.32;
      this.delay.connect(fb).connect(this.delay);
      this.delay.connect(this.music);
      const len = ctx.sampleRate;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      void ctx.resume().catch(() => {});
    } catch {
      this.ctx = undefined; // no audio available: the game stays silent
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.02);
  }

  suspend(): void { void this.ctx?.suspend().catch(() => {}); }
  resume(): void { void this.ctx?.resume().catch(() => {}); }

  /** Practice mode: a checkpoint was reached. */
  checkpoint(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    this.tone(this.sfx, 'triangle', mtof(79), mtof(79), t, 0.1, 0.16);
    this.tone(this.sfx, 'triangle', mtof(86), mtof(86), t + 0.07, 0.16, 0.16);
  }

  /** `muffled`: the run starts inside a gravity-flip zone (practice checkpoints). */
  startMusic(world: number, bpm: number, muffled = false): void {
    this.hype = 0;
    if (!this.ctx) return;
    this.song = SONGS[world % SONGS.length];
    this.stepDur = 60 / bpm / 4;
    this.delay.delayTime.setValueAtTime(this.stepDur * 3, this.ctx.currentTime);
    this.muffle(muffled, 0.01);
    this.playing = true;
    this.step = 0;
    this.gemCombo = 0;
    const t = this.ctx.currentTime;
    this.nextTime = t + 0.04;
    this.music.gain.cancelScheduledValues(t);
    this.music.gain.setValueAtTime(0.0001, t);
    this.music.gain.linearRampToValueAtTime(0.75, t + 0.05);
  }

  stopMusic(): void {
    if (!this.ctx) return;
    this.playing = false;
    const t = this.ctx.currentTime;
    this.music.gain.cancelScheduledValues(t);
    this.music.gain.setTargetAtTime(0, t, 0.03);
  }

  /** Call every frame: schedules notes slightly ahead of the audio clock. */
  update(): void {
    const ctx = this.ctx;
    if (!ctx || !this.playing || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (this.nextTime < now - 0.25) {
      const skip = Math.ceil((now - this.nextTime) / this.stepDur);
      this.step += skip; this.nextTime += skip * this.stepDur;
    }
    while (this.nextTime < now + 0.14) {
      this.schedule(this.step, this.nextTime);
      this.step++; this.nextTime += this.stepDur;
    }
  }

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private tone(dest: AudioNode, type: OscillatorType, f0: number, f1: number, t: number, dur: number, peak: number, cutoff = 0): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ctx.createGain();
    this.env(g, t, peak, 0.005, dur);
    if (cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.setValueAtTime(cutoff, t); f.frequency.exponentialRampToValueAtTime(Math.max(80, cutoff * 0.3), t + dur);
      o.connect(f).connect(g);
    } else o.connect(g);
    g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }

  private hiss(dest: AudioNode, t: number, dur: number, peak: number, type: BiquadFilterType, freq: number, sweep = 0): void {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    const g = ctx.createGain();
    this.env(g, t, peak, 0.003, dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  private kick(t: number, peak = 0.95): void {
    this.tone(this.music, 'sine', 150, 42, t, 0.22, peak);
    this.tone(this.music, 'triangle', 320, 90, t, 0.05, peak * 0.35); // click that survives phone speakers
  }
  private snare(t: number, peak = 0.4): void {
    this.hiss(this.music, t, 0.16, peak, 'bandpass', 1900);
    this.tone(this.music, 'triangle', 230, 120, t, 0.09, peak * 0.6);
  }
  private hat(t: number, peak: number, open = false): void {
    this.hiss(this.music, t, open ? 0.16 : 0.035, peak, 'highpass', 7500);
  }
  /** Three detuned saws: the wide trance lead. */
  private supersaw(dest: AudioNode, note: number, t: number, dur: number, peak: number): void {
    for (const d of [-0.12, 0, 0.12]) this.tone(dest, 'sawtooth', mtof(note + d), mtof(note + d), t, dur, peak / 2.2, 3400);
  }
  /** Saw bass through a resonant filter swept by an LFO. */
  private wobble(note: number, t: number, dur: number, rateHz: number, peak: number): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.01);
    g.gain.setValueAtTime(peak, t + dur - 0.04);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.Q.value = 9; f.frequency.value = 700;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rateHz;
    const depth = ctx.createGain();
    depth.gain.value = 560;
    lfo.connect(depth).connect(f.frequency);
    for (const [type, mul] of [['sawtooth', 1], ['square', 2]] as [OscillatorType, number][]) {
      const o = ctx.createOscillator();
      o.type = type; o.frequency.value = mtof(note) * mul;
      o.connect(f);
      o.start(t); o.stop(t + dur + 0.02);
    }
    f.connect(g).connect(this.music);
    lfo.start(t); lfo.stop(t + dur + 0.02);
  }
  /** Reversed gravity pushes the music "underwater"; leaving the zone opens it up again. */
  private muffle(on: boolean, glide = 0.12): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, f = this.musicFilter;
    f.frequency.cancelScheduledValues(t);
    f.frequency.setTargetAtTime(on ? 620 : 20000, t, glide);
    f.Q.setTargetAtTime(on ? 7 : 1, t, glide);
  }
  /** Squelchy 303-style note: saw through a resonant filter with its own envelope. */
  private acid(note: number, t: number, dur: number, cut: number, peak: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth'; o.frequency.value = mtof(note);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.Q.value = 13;
    f.frequency.setValueAtTime(cut, t);
    f.frequency.exponentialRampToValueAtTime(260, t + dur);
    const g = ctx.createGain();
    this.env(g, t, peak, 0.004, dur);
    o.connect(f).connect(g).connect(this.music);
    o.start(t); o.stop(t + dur + 0.05);
  }
  /** Glassy bell: a sine with an inharmonic partial. */
  private bell(dest: AudioNode, note: number, t: number, peak: number): void {
    this.tone(dest, 'sine', mtof(note), mtof(note), t, 0.5, peak);
    this.tone(dest, 'sine', mtof(note) * 3.01, mtof(note) * 3.01, t, 0.12, peak * 0.45);
  }
  /** Proximity alarm for the gravity-flip ceiling (rate limited). */
  warn(level: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    if (t - this.lastWarn < 0.3 - 0.16 * level) return;
    this.lastWarn = t;
    this.tone(this.sfx, 'square', 1250 + 500 * level, 1250 + 500 * level, t, 0.06, 0.1, 6000);
  }

  private echo(): GainNode {
    const g = this.ctx!.createGain();
    g.connect(this.music); g.connect(this.delay);
    return g;
  }

  private schedule(step: number, t: number): void {
    const s = step % 16;
    const bar = Math.floor(step / 16);
    const ci = bar % 4;
    const root = this.song.roots[ci], chord = this.song.chords[ci];
    const H = this.hype;
    const sd = this.stepDur;

    if (this.song.style === 'house') {
      const intro = bar < 1;
      if (s % 4 === 0) this.kick(t);
      if (!intro && (s === 4 || s === 12)) this.snare(t, 0.3);
      if (s % 2 === 0) this.hat(t, s % 4 === 2 ? 0.16 : 0.07, s % 4 === 2);
      if (H >= 1 && s % 2 === 1) this.hat(t, 0.08);
      if (s % 4 !== 0) this.tone(this.music, 'sawtooth', mtof(root - 12), mtof(root - 12), t, 0.12, 0.3, 700);
      const pat = [0, 1, 2, 1, 0, 2, 1, 2];
      const note = root + 24 + chord[pat[s % 8]] + (s >= 8 && bar % 2 === 1 ? 12 : 0);
      const e = this.echo();
      this.tone(e, this.song.lead, mtof(note), mtof(note), t, 0.11, intro ? 0.05 : 0.085, 2600);
      if (H >= 1) this.tone(e, 'triangle', mtof(note + 12), mtof(note + 12), t, 0.09, 0.05);
      if (!intro && s === 0) for (const iv of chord) this.tone(this.music, 'triangle', mtof(root + 12 + iv), mtof(root + 12 + iv), t, 1.6, 0.05);
      if (H >= 2 && s % 4 === 2) for (const iv of chord) this.supersaw(this.music, root + 24 + iv, t, sd * 1.5, 0.07);
    } else if (this.song.style === 'breaks') {
      if (s === 0 || s === 6 || s === 10 || (bar % 4 === 3 && s === 14)) this.kick(t, 0.9);
      if (s === 4 || s === 12) this.snare(t, 0.42);
      this.hat(t, s % 2 === 0 ? 0.11 : 0.05, H >= 1 && s % 4 === 2);
      if (s % 4 !== 0) this.tone(this.music, 'sawtooth', mtof(root - 12), mtof(root), t, sd * 0.9, 0.3, 900);
      const rhythm = [0, 3, 6, 8, 11, 14];
      const i = rhythm.indexOf(s);
      if (i >= 0) {
        const tones = bar % 2 === 0 ? [0, 2, 1, 2, 0, 1] : [2, 1, 2, 0, 1, 2];
        const up = bar % 2 === 1 && i >= 3 ? 12 : 0;
        this.supersaw(this.echo(), root + 24 + chord[tones[i]] + up, t, sd * 2.4, 0.2);
      }
      if (s === 0 || s === 8) for (const iv of chord) this.tone(this.music, 'sawtooth', mtof(root + 12 + iv), mtof(root + 12 + iv), t, sd * 3, 0.045, 1800);
      if (H >= 1 && (s === 4 || s === 12)) this.hiss(this.music, t, 0.2, 0.16, 'highpass', 4000);
      if (H >= 2) { const n = root + 36 + chord[s % 3]; this.tone(this.echo(), 'square', mtof(n), mtof(n), t, sd * 0.8, 0.045, 5000); }
    } else if (this.song.style === 'dnb') {
      if (s === 0 || s === 10) this.kick(t, 1);
      if (s === 4 || s === 12) this.snare(t, 0.5);
      if (H >= 1 && (s === 7 || s === 15)) this.snare(t, 0.16);
      this.hat(t, s % 2 === 0 ? 0.1 : H >= 1 ? 0.06 : 0.025, s === 14);
      if (s === 0 || s === 8) {
        for (const d of [-0.18, 0.18]) this.tone(this.music, 'sawtooth', mtof(root + d), mtof(root + d), t, sd * 7.6, 0.16, 520); // reese bass
      }
      const pent = [0, 3, 5, 7, 10, 12];
      const i = [0, 3, 6, 9, 12, 14].indexOf(s);
      if (i >= 0) this.bell(this.echo(), this.song.roots[0] + 36 + pent[(bar * 5 + i * 2) % 6], t, 0.13);
      if (s === 0) for (const iv of chord) this.tone(this.music, 'triangle', mtof(root + 24 + iv), mtof(root + 24 + iv), t, sd * 15, 0.035);
      if (H >= 2) { const n = root + 36 + chord[(s + bar) % 3] + (s % 4 === 3 ? 12 : 0); this.tone(this.echo(), 'square', mtof(n), mtof(n), t, sd * 0.7, 0.04, 5000); }
    } else if (this.song.style === 'acid') {
      if (s % 4 === 0) this.kick(t, 1);
      if (s % 4 === 2) this.hat(t, 0.16, true);
      if (bar >= 1 && (s === 4 || s === 12)) this.hiss(this.music, t, 0.12, 0.28, 'bandpass', 1500);
      if (H >= 1) this.hat(t, 0.05);
      const line = [0, 0, 12, 0, 3, 0, 12, 10, 0, 0, 7, 0, 12, 3, 0, 10];
      const accent = s === 2 || s === 6 || s === 10 || s === 13;
      const sweep = 700 + 1100 * (0.5 - 0.5 * Math.cos(bar * 0.8)) + (H >= 1 ? 500 : 0);
      this.acid(root - 12 + line[s], t, sd * (accent ? 1.6 : 0.85), accent ? sweep * 2.2 : sweep, accent ? 0.3 : 0.2);
      if (H >= 2 && s % 4 === 2) for (const iv of chord) this.supersaw(this.music, root + 24 + iv, t, sd * 1.4, 0.06);
      if (s === 0 && bar % 4 === 3) this.hiss(this.music, t, sd * 16, 0.12, 'bandpass', 400, 6000);
    } else {
      if (s === 0 || s === 10 || (bar % 2 === 1 && s === 3)) this.kick(t, 1);
      if (s === 8) { this.snare(t, 0.6); this.hiss(this.music, t, 0.3, 0.2, 'lowpass', 3000); }
      if (s === 2 || s === 6 || s === 11 || s === 14 || s === 15) this.hat(t, 0.1);
      if (H >= 1) this.hat(t, s >= 12 ? 0.09 : 0.04);
      const beatHz = 1 / (sd * 4);
      const rate = [2, 4, 3, 6][bar % 4] * beatHz;
      if (s === 0) this.wobble(root, t, sd * 7.5, rate, 0.34);
      if (s === 8) this.wobble(root + (bar % 2 ? 12 : 0), t, sd * 7.5, rate * (bar % 4 === 3 ? 2 : 1), 0.3);
      if (H >= 1 && s === 0) this.wobble(root + 12, t, sd * 15, rate / 2, 0.12);
      const phr = [0, 1, 3, 7, 8, 12];
      if (s === 0 || s === 3 || s === 7 || s === 10 || s === 13) {
        const n = this.song.roots[0] + 36 + phr[(s * 7 + bar * 3) % 6];
        this.tone(this.echo(), 'triangle', mtof(n), mtof(n), t, 0.2, 0.12);
      }
      if (H >= 2 && s === 0 && bar % 2 === 0) this.tone(this.music, 'sawtooth', mtof(root + 24), mtof(root + 36), t, sd * 16, 0.06, 2400);
    }
  }

  /** Stingers for passing halfway and for beating the level record. */
  milestone(kind: 'half' | 'record'): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime, d = this.sfx;
    const base = this.song.roots[0] + 36;
    if (kind === 'half') {
      [0, 7, 12].forEach((iv, i) => this.tone(d, 'triangle', mtof(base + iv), mtof(base + iv), t + i * 0.06, 0.25, 0.14));
      this.hiss(d, t, 0.5, 0.14, 'bandpass', 800, 7000);
    } else {
      [0, 4, 7, 12, 16, 24].forEach((iv, i) => this.supersaw(d, base + iv, t + i * 0.055, 0.35, 0.2));
      this.hiss(d, t, 0.9, 0.2, 'highpass', 3000, 9000);
      this.tone(d, 'sine', 90, 45, t, 0.4, 0.5);
    }
  }

  onEvent(e: SimEvent): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime, d = this.sfx;
    switch (e.type) {
      case 'jump': this.tone(d, 'triangle', 280, 640, t, 0.13, 0.3); break;
      case 'pad': this.tone(d, 'square', 300, 1200, t, 0.22, 0.16, 3000); this.tone(d, 'triangle', 150, 600, t, 0.25, 0.3); break;
      case 'boost': this.tone(d, 'sawtooth', 120, 900, t, 0.4, 0.2, 2500); this.hiss(d, t, 0.45, 0.25, 'bandpass', 500, 5000); break;
      case 'land': {
        const k = Math.min(1, e.impact / 24);
        this.tone(d, 'sine', 130, 55, t, 0.12, 0.25 + 0.35 * k);
        this.hiss(d, t, 0.06, 0.1 + 0.15 * k, 'lowpass', 1800);
        break;
      }
      case 'gem': {
        this.gemCombo = t - this.lastGem < 0.7 ? Math.min(this.gemCombo + 1, 7) : 0;
        this.lastGem = t;
        const n = 84 + [0, 2, 4, 7, 9, 12, 14, 16][this.gemCombo];
        this.tone(d, 'square', mtof(n), mtof(n), t, 0.09, 0.12, 6000);
        this.tone(d, 'square', mtof(n + 7), mtof(n + 7), t + 0.05, 0.14, 0.1, 6000);
        break;
      }
      case 'nearMiss': this.hiss(d, t, 0.16, 0.14, 'bandpass', 2500, 700); break;
      case 'flipOn':
        this.muffle(true);
        this.tone(d, 'sawtooth', 1400, 60, t, 0.7, 0.3, 4000);
        this.tone(d, 'sine', 90, 30, t, 0.6, 0.6);
        this.hiss(d, t, 0.7, 0.3, 'bandpass', 6000, 300);
        break;
      case 'flipOff':
        this.muffle(false);
        this.tone(d, 'sawtooth', 70, 1500, t, 0.45, 0.25, 5000);
        this.hiss(d, t, 0.5, 0.28, 'bandpass', 300, 7000);
        [0, 7, 12].forEach((iv, i) => this.tone(d, 'triangle', mtof(72 + iv), mtof(72 + iv), t + 0.1 + i * 0.05, 0.2, 0.13));
        break;
      case 'thrust':
        this.hiss(d, t, 0.09, 0.3, 'bandpass', 1100, 500);
        this.tone(d, 'square', 240, 110, t, 0.08, 0.14, 1500);
        break;
      case 'fly':
        this.tone(d, 'sine', 400, 2600, t, 0.3, 0.3);
        this.hiss(d, t + 0.1, 0.5, 0.6, 'lowpass', 5000, 150);
        break;
      case 'crash':
      case 'fall':
        this.hiss(d, t, 0.55, 0.7, 'lowpass', 5000, 150);
        this.tone(d, 'sawtooth', 220, 35, t, 0.5, 0.4, 1800);
        break;
      case 'finish':
        [0, 4, 7, 12, 16, 19, 24].forEach((iv, i) => this.tone(d, 'square', mtof(72 + iv), mtof(72 + iv), t + i * 0.07, 0.3, 0.13, 5000));
        break;
    }
  }
}
