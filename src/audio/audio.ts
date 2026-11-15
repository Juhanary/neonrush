import type { SimEvent } from '../core/sim';
import { BeatClock } from './clock';
import { Mix, Voices, mtof } from './engine';
import { SONGS, chordRoot, noteOf, playStep, type Song } from './songs';

export interface SongOptions {
  /** Arrangement level (1..3) of a bar. Tracks pass Level.energyOf; free-running songs use their own. */
  energy?: (bar: number) => number;
  /** Beat position the song starts from (practice checkpoints start mid-song). */
  from?: number;
  /** Start with the flip-zone filter on. */
  muffled?: boolean;
  /** Play the player's own music file instead of the built-in song (level editor tracks). */
  track?: MusicTrack;
}

/** A decoded music file on a beat grid: beat 0 of the track sounds `start` seconds into it. */
export interface MusicTrack { buf: AudioBuffer; bpm: number; start: number }

/** A mastered song is much louder than the synth mix; this puts it at about the same level. */
const TRACK_GAIN = 0.5;
/** Delay of the mix bus itself: the compressor and the limiter each look 6 ms ahead. */
const BUS_DELAY = 0.012;

/**
 * Music and sound effects.
 *
 * The music does not run on its own clock. The game tells it every frame where the ship is in beats
 * (`sync`), and the sequencer schedules the sixteenths that are about to be reached. So the song is tied
 * to the track, not to time: a boost pushes the tempo up, a gravity-flip zone halves it, a practice
 * restart resumes the song at that checkpoint, and the same bar of music always plays over the same
 * bar of road.
 *
 * A custom track can bring its own music file (`SongOptions.track`). The file is tied to the ship in the
 * same way: its playback speed follows the ship's speed, and a small correction keeps the file position
 * on the ship's beat position, so a boost bends the song up, a flip zone drops it to half speed and a
 * practice restart starts it at that checkpoint.
 */
export class GameAudio {
  private ctx?: AudioContext;
  private mix!: Mix;
  private v!: Voices;
  private song: Song = SONGS.menu;
  private songName = '';
  private energy: (bar: number) => number = () => 2;
  private playing = false;
  private clock = new BeatClock();
  private lastWarn = 0;
  private gemCombo = 0;
  private lastGem = 0;
  /** 0 normal, 1 past halfway, 2 record run: each level adds instrument layers. */
  hype = 0;
  muted = false;
  /** Debug: when set, every scheduled sixteenth is recorded here as [step, context time]. */
  log?: [number, number][];
  /** The player's own music for the current track, and the source that is playing it. */
  private track?: MusicTrack;
  private src?: AudioBufferSourceNode;
  private srcGain?: GainNode;
  /** File position `srcPos` at context time `srcT`, moving at `srcRate`. */
  private srcPos = 0; private srcT = 0; private srcRate = 1;
  /** Debug: how far the file is from where the ship says it should be, in seconds (positive = ahead). */
  trackError = 0;
  private previewTimer = 0;
  private clickBus?: GainNode;

  /** Must be called from a user gesture. */
  unlock(): void {
    if (this.ctx) { void this.ctx.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      this.ctx = ctx;
      this.mix = new Mix(ctx);
      this.v = new Voices(this.mix);
      this.mix.master.gain.value = this.muted ? 0 : 0.85;
      void ctx.resume().catch(() => {});
    } catch {
      this.ctx = undefined; // no audio available: the game stays silent
    }
  }

  get ready(): boolean { return !!this.ctx; }

  /** Decode a music file. Needs `unlock()` first; rejects when the browser cannot read the format. */
  decode(data: ArrayBuffer): Promise<AudioBuffer> {
    if (!this.ctx) return Promise.reject(new Error('no audio'));
    return this.ctx.decodeAudioData(data);
  }
  /** Name of the song that is playing, or '' when the music is stopped. */
  get current(): string { return this.playing ? this.songName : ''; }
  /** Tempo of a free-running song (the menu theme). */
  bpmOf(name: string): number { return SONGS[name]?.bpm ?? 120; }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx) this.mix.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.02);
  }

  suspend(): void { void this.ctx?.suspend().catch(() => {}); }
  resume(): void { void this.ctx?.resume().catch(() => {}); }

  /** Choose the song and where in it to begin. Nothing sounds until `sync` is called. */
  playSong(name: string, opt: SongOptions = {}): void {
    this.hype = 0;
    this.song = SONGS[name] ?? SONGS.menu;
    this.songName = name;
    const own = this.song.energy?.replace(/\s/g, '');
    const loop = this.song.loop ?? 16;
    this.energy = opt.energy ?? ((bar) => (own ? +own[((bar % loop) + loop) % loop] : 2));
    this.clock.reset(opt.from ?? 0);
    this.gemCombo = 0;
    this.stopPreview();
    this.stopSrc();
    this.track = opt.track;
    if (!this.ctx) return;
    this.playing = true;
    const t = this.ctx.currentTime;
    this.mix.muffle(!!opt.muffled, 0.01);
    const g = this.mix.music.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    g.linearRampToValueAtTime(0.8, t + 0.04);
  }

  stopMusic(): void {
    if (!this.ctx) return;
    this.playing = false;
    this.stopSrc(0.08);
    const t = this.ctx.currentTime;
    this.mix.music.gain.cancelScheduledValues(t);
    this.mix.music.gain.setTargetAtTime(0, t, 0.03);
  }

  private stopSrc(fade = 0.02): void {
    const src = this.src, g = this.srcGain, ctx = this.ctx;
    this.src = undefined; this.srcGain = undefined;
    if (!src || !g || !ctx) return;
    const t = ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setTargetAtTime(0, t, fade / 3);
    try { src.stop(t + fade + 0.02); } catch { /* already stopped */ }
  }

  /**
   * Keep the music file on the ship: `beat` is where the ship is, `bps` how fast it moves. The file plays at
   * the ship's speed relative to the track speed, trimmed by up to 1.2 % to pull the file position onto
   * the ship's, and is restarted at the right spot when it is more than 90 ms off (a stutter, a restart).
   */
  private syncTrack(ctx: AudioContext, tr: MusicTrack, beat: number, bps: number): void {
    const now = ctx.currentTime;
    const rate = bps / (tr.bpm / 60);
    // what leaves the context now is heard a little later
    const lat = BUS_DELAY + Math.min(0.2, Math.max(0, ctx.outputLatency || ctx.baseLatency || 0));
    const want = tr.start + (beat * 60) / tr.bpm + lat * rate;
    if (rate < 0.05 || want >= tr.buf.duration - 0.05) { this.stopSrc(); return; }
    if (this.src) {
      const pos = this.srcPos + (now - this.srcT) * this.srcRate;
      const err = pos - want;
      this.trackError = err;
      if (Math.abs(err) <= 0.09) {
        const r = rate * (1 - Math.max(-0.012, Math.min(0.012, err * 0.25)));
        this.srcPos = pos; this.srcT = now; this.srcRate = r;
        this.src.playbackRate.setValueAtTime(r, now);
        return;
      }
      this.stopSrc();
    }
    if (want < 0) return; // the track starts before the file does: silence until the file begins
    const lead = 0.03;
    const src = ctx.createBufferSource();
    src.buffer = tr.buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(TRACK_GAIN, now + lead + 0.02);
    src.connect(g).connect(this.mix.music);
    src.start(now + lead, want + lead * rate);
    this.src = src; this.srcGain = g;
    this.srcPos = want + lead * rate; this.srcT = now + lead; this.srcRate = rate;
    this.trackError = 0;
  }

  /**
   * Editor: play a music file from `start` with a click on every beat (higher on the bar line), so the
   * beat grid can be checked by ear. Stops by itself after `seconds`.
   */
  preview(tr: MusicTrack, seconds = 12): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.stopMusic();
    this.stopPreview();
    void ctx.resume().catch(() => {});
    const t = ctx.currentTime + 0.08;
    this.mix.muffle(false, 0.01);
    this.mix.music.gain.cancelScheduledValues(t);
    this.mix.music.gain.setValueAtTime(0.8, ctx.currentTime);
    const src = ctx.createBufferSource();
    src.buffer = tr.buf;
    const g = ctx.createGain();
    g.gain.value = TRACK_GAIN;
    src.connect(g).connect(this.mix.music);
    const from = Math.max(0, tr.start);
    // a start before the file begins is silence until the file does
    src.start(t + Math.max(0, -tr.start), from, seconds);
    this.src = src; this.srcGain = g;
    // the clicks get their own bus, so stopping the preview silences the ones already scheduled
    const bus = ctx.createGain();
    bus.connect(this.mix.sfx);
    this.clickBus = bus;
    const beat = 60 / tr.bpm;
    for (let k = 0; k * beat < seconds; k++) {
      const f = k % 4 === 0 ? 2100 : 1400;
      this.v.tone('square', f, f, t + k * beat, 0.03, k % 4 === 0 ? 0.3 : 0.2, 6000, bus);
    }
    this.previewTimer = window.setTimeout(() => this.stopPreview(), seconds * 1000 + 200);
  }

  stopPreview(): void {
    if (!this.previewTimer) return;
    clearTimeout(this.previewTimer);
    this.previewTimer = 0;
    this.clickBus?.disconnect();
    this.clickBus = undefined;
    this.stopSrc(0.05);
    if (this.ctx && !this.playing) this.mix.music.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
  }
  /** True while an editor preview is sounding. */
  get previewing(): boolean { return this.previewTimer !== 0; }

  /**
   * Call every frame while a song plays: `beat` is the current position in beats and `bps` how fast it
   * is advancing (0 = standing still). Schedules every sixteenth that will be reached in the next ~130 ms.
   */
  sync(beat: number, bps: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.playing || ctx.state !== 'running') return;
    const was = this.clock.bps;
    const due = this.clock.advance(ctx.currentTime, beat, bps);
    if (this.track) {
      // the file is the music; the clock still runs so that sound effects land on its grid
      this.syncTrack(ctx, this.track, beat, bps);
      return;
    }
    if (this.clock.bps !== was && this.clock.bps > 0) this.mix.setStep(1 / (this.clock.bps * 4));
    if (!due.length) return;
    const sd = 1 / (this.clock.bps * 4);
    const loop = this.song.loop ? this.song.loop * 16 : 0;
    for (const d of due) {
      const step = loop ? d.step % loop : d.step;
      const bar = Math.floor(step / 16);
      this.log?.push([d.step, d.t]);
      playStep(this.v, this.song, { step, t: d.t, sd, energy: this.energy(bar), next: this.energy(bar + 1), hype: this.hype });
    }
  }

  /** Context time of the next sixteenth (sound effects that should land in the groove wait for it). */
  private grid(maxWait = 0.16): number {
    const now = this.ctx!.currentTime;
    return this.playing ? this.clock.grid(now, maxWait) : now;
  }
  /** A note of the chord that is sounding right now: 0 root, 1 third, 2 fifth, 3 octave, 4 third above ... */
  private chordNote(i: number, oct: number): number {
    const bar = this.clock.bps ? Math.floor(this.clock.beatAt(this.ctx!.currentTime) / 4) : 0;
    const k = Math.max(0, i);
    return noteOf(this.song, chordRoot(this.song, bar) + [0, 2, 4][k % 3] + 7 * Math.floor(k / 3), oct);
  }

  /** Practice mode: a checkpoint was reached. */
  checkpoint(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = this.grid();
    this.v.bell(this.chordNote(2, 1), t, 0.5, this.mix.sfx);
    this.v.bell(this.chordNote(3, 1), t + 0.08, 0.5, this.mix.sfx);
  }

  /** Rising alarm while the ship is close to the ceiling of a flip zone (level 0..1). */
  warn(level: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    if (t - this.lastWarn < 0.3 - 0.16 * level) return;
    this.lastWarn = t;
    this.v.tone('square', 1250 + 500 * level, 1250 + 500 * level, t, 0.06, 0.1, 6000);
  }

  /** Stingers for passing halfway and for beating the level record, in the key of the song. */
  milestone(kind: 'half' | 'record'): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = this.grid(), v = this.v, sd = this.clock.bps ? 1 / (this.clock.bps * 4) : 0.1;
    if (kind === 'half') {
      [0, 2, 3].forEach((n, i) => v.lead(this.chordNote(n, 1), t + i * sd, sd * 1.5, 0.55, 'tri', this.mix.sfx));
      v.hiss(t, 0.5, 0.12, 'bandpass', 800, 7000);
    } else {
      [0, 1, 2, 3, 4, 5].forEach((n, i) => v.lead(this.chordNote(n, 1), t + i * sd, sd * 2, 0.6, 'saw', this.mix.sfx));
      v.hiss(t, 0.9, 0.16, 'highpass', 3000, 9000);
      v.tone('sine', 90, 45, t, 0.4, 0.45);
    }
  }

  onEvent(e: SimEvent): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime, v = this.v;
    switch (e.type) {
      case 'jump': {
        // a quick two-note flick up the current chord: the player's own instrument
        const a = mtof(this.chordNote(0, 0)), b = mtof(this.chordNote(2, 0));
        v.tone('triangle', a, b, t, 0.11, 0.3);
        v.tone('square', a * 2, b * 2, t, 0.07, 0.06, 5000);
        break;
      }
      case 'pad': {
        const q = this.grid(0.09);
        [0, 1, 2, 3].forEach((n, i) => v.pluck(this.chordNote(n, 1), q + i * 0.045, 0.12, 1.3, 5200));
        v.tone('triangle', 150, 600, t, 0.25, 0.28);
        break;
      }
      case 'boost':
        v.tone('sawtooth', 120, 900, t, 0.4, 0.18, 2500);
        v.hiss(t, 0.55, 0.22, 'bandpass', 500, 6000);
        v.stab([this.chordNote(0, 0), this.chordNote(1, 0), this.chordNote(2, 0)], this.grid(), 0.3, 1.2);
        break;
      case 'land': {
        const k = Math.min(1, e.impact / 24);
        v.tone('sine', 130, 55, t, 0.12, 0.22 + 0.3 * k);
        v.hiss(t, 0.06, 0.08 + 0.12 * k, 'lowpass', 1800);
        break;
      }
      case 'gem': {
        // gems are played like a melody: on the grid, climbing the chord while the streak lasts
        const q = this.grid();
        this.gemCombo = q - this.lastGem < 1.4 ? Math.min(this.gemCombo + 1, 7) : 0;
        this.lastGem = q;
        v.bell(this.chordNote(this.gemCombo, 1), q, 0.75, this.mix.sfx);
        v.tone('square', mtof(this.chordNote(this.gemCombo, 2)), mtof(this.chordNote(this.gemCombo, 2)), q, 0.07, 0.05, 7000);
        break;
      }
      case 'nearMiss': v.hiss(t, 0.16, 0.12, 'bandpass', 2500, 700); break;
      case 'flipOn':
        this.mix.muffle(true);
        v.tone('sawtooth', 1400, 60, t, 0.7, 0.26, 4000);
        v.tone('sine', 90, 30, t, 0.6, 0.5);
        v.hiss(t, 0.7, 0.25, 'bandpass', 6000, 300);
        break;
      case 'flipOff':
        this.mix.muffle(false);
        v.tone('sawtooth', 70, 1500, t, 0.45, 0.22, 5000);
        v.hiss(t, 0.5, 0.24, 'bandpass', 300, 7000);
        [0, 1, 2, 3].forEach((n, i) => v.pluck(this.chordNote(n, 1), t + 0.1 + i * 0.05, 0.15, 1.2, 5000));
        break;
      case 'thrust':
        // the tap is a drum: a tom tuned to the chord, so tapping on the beat plays along
        v.tone('sine', mtof(this.chordNote(0, -1)) * 2, mtof(this.chordNote(0, -1)), t, 0.14, 0.4);
        v.hiss(t, 0.05, 0.16, 'bandpass', 1400, 600);
        break;
      case 'fly':
        v.tone('sine', 400, 2600, t, 0.3, 0.28);
        v.hiss(t + 0.1, 0.5, 0.5, 'lowpass', 5000, 150);
        break;
      case 'crash':
      case 'fall':
        v.hiss(t, 0.55, 0.6, 'lowpass', 5000, 150);
        v.tone('sawtooth', 220, 35, t, 0.5, 0.36, 1800);
        break;
      case 'finish': {
        // the tonic chord, rolled upwards
        const tonic = [0, 2, 4, 7, 9, 11, 14];
        tonic.forEach((d, i) => v.lead(noteOf(this.song, d, 0), t + i * 0.07, 0.5, 0.6, 'square', this.mix.sfx));
        v.stab([0, 2, 4].map((d) => noteOf(this.song, d, 0)), t + 0.5, 1.2, 1.4);
        break;
      }
    }
  }

  /** Debug / test only: render `bars` bars of a built-in song offline. Its first beat is 0.05 s in. */
  static async renderSong(name: string, bars: number, energy: number | ((bar: number) => number), bpm: number): Promise<AudioBuffer> {
    const sr = 44100, sd = 60 / bpm / 4;
    const ctx = new OfflineAudioContext(2, Math.ceil(sr * (bars * 16 * sd + 1)), sr);
    const mix = new Mix(ctx);
    const v = new Voices(mix);
    mix.music.gain.value = 0.8;
    mix.setStep(sd);
    const song = SONGS[name];
    const e = typeof energy === 'number' ? () => energy : energy;
    for (let step = 0; step < bars * 16; step++) playStep(v, song, { step, t: 0.05 + step * sd, sd, energy: e(Math.floor(step / 16)), next: e(Math.floor(step / 16) + 1), hype: 0 });
    return ctx.startRendering();
  }

  /**
   * Debug / test only: render `bars` bars of a song offline and return its level statistics.
   * Used by scripts/audio.mjs to catch clipping, silence and a lopsided mix without anyone listening.
   */
  static async render(name: string, bars: number, energy: number, bpm: number): Promise<{ peak: number; rms: number; low: number; mid: number; high: number; clipped: number }> {
    const buf = await GameAudio.renderSong(name, bars, energy, bpm);
    const sr = buf.sampleRate;
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    let peak = 0, sum = 0, clipped = 0, lo = 0, hi = 0, sumLow = 0, sumHigh = 0, sumMid = 0;
    const aLow = 1 - Math.exp((-2 * Math.PI * 200) / sr), aHigh = 1 - Math.exp((-2 * Math.PI * 3000) / sr);
    for (let i = 0; i < L.length; i++) {
      const x = (L[i] + R[i]) / 2;
      const a = Math.max(Math.abs(L[i]), Math.abs(R[i]));
      if (a > peak) peak = a;
      if (a >= 0.999) clipped++;
      sum += x * x;
      lo += (x - lo) * aLow; hi += (x - hi) * aHigh;
      sumLow += lo * lo; sumHigh += (x - hi) * (x - hi); sumMid += (hi - lo) * (hi - lo);
    }
    const db = (p: number) => +(10 * Math.log10(p / L.length + 1e-12)).toFixed(1);
    return { peak: +peak.toFixed(3), rms: db(sum), low: db(sumLow), mid: db(sumMid), high: db(sumHigh), clipped };
  }
}
