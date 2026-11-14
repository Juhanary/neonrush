import type { SimEvent } from '../core/sim';
import { CFG } from '../core/config';

const STEP = 60 / CFG.bpm / 4; // sixteenth note
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface Song { roots: number[]; chords: number[][]; lead: OscillatorType }
const MIN = [0, 3, 7], MAJ = [0, 4, 7];
const SONGS: Song[] = [
  { roots: [45, 41, 48, 43], chords: [MIN, MAJ, MAJ, MAJ], lead: 'square' },
  { roots: [50, 46, 41, 48], chords: [MIN, MAJ, MAJ, MAJ], lead: 'sawtooth' },
  { roots: [40, 48, 50, 47], chords: [MIN, MAJ, MAJ, MIN], lead: 'triangle' },
];

/** Fully synthesised music and effects (no audio files to load). */
export class GameAudio {
  private ctx?: AudioContext;
  private master!: GainNode;
  private music!: GainNode;
  private sfx!: GainNode;
  private delay!: DelayNode;
  private noise!: AudioBuffer;
  private playing = false;
  private step = 0;
  private nextTime = 0;
  private song = SONGS[0];
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
      this.music = ctx.createGain(); this.music.gain.value = 0; this.music.connect(this.master);
      this.sfx = ctx.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
      this.delay = ctx.createDelay(1); this.delay.delayTime.value = STEP * 3;
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

  startMusic(world: number): void {
    if (!this.ctx) return;
    this.song = SONGS[world % SONGS.length];
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
      const skip = Math.ceil((now - this.nextTime) / STEP);
      this.step += skip; this.nextTime += skip * STEP;
    }
    while (this.nextTime < now + 0.14) {
      this.schedule(this.step, this.nextTime);
      this.step++; this.nextTime += STEP;
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

  private schedule(step: number, t: number): void {
    const s = step % 16;
    const bar = Math.floor(step / 16);
    const ci = bar % 4;
    const root = this.song.roots[ci], chord = this.song.chords[ci];
    const intro = bar < 1;
    if (s % 4 === 0) { this.tone(this.music, 'sine', 150, 42, t, 0.22, 0.95); }
    if (!intro && (s === 4 || s === 12)) this.hiss(this.music, t, 0.14, 0.3, 'bandpass', 1700);
    if (s % 2 === 0) this.hiss(this.music, t, s % 4 === 2 ? 0.07 : 0.03, s % 4 === 2 ? 0.16 : 0.07, 'highpass', 7500);
    if (s % 4 !== 0) this.tone(this.music, 'sawtooth', mtof(root - 12), mtof(root - 12), t, 0.12, 0.3, 700);
    const pat = [0, 1, 2, 1, 0, 2, 1, 2];
    const note = root + 24 + chord[pat[s % 8]] + (s >= 8 && bar % 2 === 1 ? 12 : 0);
    const g = this.ctx!.createGain();
    g.gain.value = 1;
    g.connect(this.music); g.connect(this.delay);
    this.tone(g, this.song.lead, mtof(note), mtof(note), t, 0.11, intro ? 0.05 : 0.085, 2600);
    if (!intro && s === 0) for (const iv of chord) this.tone(this.music, 'triangle', mtof(root + 12 + iv), mtof(root + 12 + iv), t, 1.6, 0.05);
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
