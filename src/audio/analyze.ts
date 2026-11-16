import { CFG } from '../core/config';
import { MAX_BPM, MIN_BPM, playableBpm, type TrackMusic } from '../core/custom';

/*
 * MUSIC ANALYSIS for the level editor: finds the tempo of a music file, where its beats fall, which
 * beat starts a bar, and how loud and how busy every beat is. No audio or DOM API here: it takes plain
 * samples, so it is unit tested with synthetic music (tests/analyze.test.ts).
 *
 * What it assumes: one steady tempo from start to end and four beats to the bar. That holds for most
 * electronic and produced music. A live recording that drifts gets the best single tempo, and its
 * beats slide away from the grid over time.
 *
 * Method
 *   1. The signal is reduced to about 11 kHz mono and cut into 23 ms windows, 100 per second.
 *      "Flux" is how much the spectrum grew since the previous window: it peaks at note and drum onsets.
 *   2. Tempo, coarse: the autocorrelation of the flux at one, two and four beats, searched over the one
 *      octave of tempos the game can be played at (95..190 BPM; anything else is folded into it).
 *   3. Tempo, fine: the whole flux curve is folded at the beat length; the right tempo piles every onset
 *      into the same few phase bins. Searched in steps of 0.005 BPM, then a straight line is fitted
 *      through the onsets on the beats, because over a three-minute song an error of 0.02 BPM is already
 *      a visible drift. The coarse result and its 4/3 and 3/4 relatives are all refined and compared.
 *   4. Phase: the fullest bin of that fold is where the beats are, with the bass band weighing most, so
 *      that off-beat hi-hats are not taken for the beat.
 *      Then beat against off-beat: what is on the beats changes through the bar, what is between them
 *      (hi-hats, an off-beat bass) is the same every time.
 *   5. Bar line: the beat position (1..4) with the most bass and the biggest loudness steps.
 */

export interface Envelopes {
  /** Envelope frames per second. */
  fps: number;
  duration: number;
  /** Onset strength per frame, and the same below about 170 Hz. */
  flux: Float32Array;
  low: Float32Array;
  /** Loudness (RMS) per frame. */
  rms: Float32Array;
}

const N = 256;
/** Seconds between the start of an analysis window and the onset that makes its flux peak (measured: tests/analyze.test.ts). */
const LATENCY = 0.0135;

function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const a = re[i]; re[i] = re[j]; re[j] = a; const b = im[i]; im[i] = im[j]; im[j] = b; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang), half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

/** Step 1: onset and loudness curves of a mono signal. Analyses at most `maxSeconds` from the start. */
export function envelopes(mono: Float32Array, sampleRate: number, maxSeconds = 480): Envelopes {
  const dec = Math.max(1, Math.round(sampleRate / 11025));
  const sr = sampleRate / dec;
  const len = Math.floor(Math.min(mono.length, maxSeconds * sampleRate) / dec);
  const x = new Float32Array(len);
  for (let i = 0; i < len; i++) { let s = 0; for (let k = 0; k < dec; k++) s += mono[i * dec + k]; x[i] = s / dec; }
  const hop = Math.round(sr / 100);
  const frames = Math.max(0, Math.floor((len - N) / hop) + 1);
  const flux = new Float32Array(frames), low = new Float32Array(frames), rms = new Float32Array(frames);
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  const re = new Float32Array(N), im = new Float32Array(N);
  const half = N / 2;
  let prev = new Float32Array(half), cur = new Float32Array(half);
  const lowBins = Math.max(2, Math.round((170 * N) / sr));
  for (let f = 0; f < frames; f++) {
    const o = f * hop;
    let e = 0;
    for (let i = 0; i < N; i++) { const v = x[o + i]; e += v * v; re[i] = v * win[i]; im[i] = 0; }
    rms[f] = Math.sqrt(e / N);
    fft(re, im);
    let all = 0, lo = 0;
    for (let k = 1; k < half; k++) {
      const m = Math.log(1 + 40 * Math.hypot(re[k], im[k]));
      cur[k] = m;
      const d = m - prev[k];
      if (d > 0) { all += d; if (k <= lowBins) lo += d; }
    }
    flux[f] = f ? all : 0;
    low[f] = f ? lo : 0;
    const t = prev; prev = cur; cur = t;
  }
  return { fps: sr / hop, duration: mono.length / sampleRate, flux, low, rms };
}

/** Flux with its local average removed, so a loud passage does not outweigh a quiet one. */
function sharpen(flux: Float32Array, fps: number): Float32Array {
  const n = flux.length, w = Math.round(fps * 0.4);
  const out = new Float32Array(n);
  let sum = 0;
  for (let i = 0; i < Math.min(n, w); i++) sum += flux[i];
  for (let i = 0; i < n; i++) {
    if (i + w < n) sum += flux[i + w];
    if (i - w - 1 >= 0) sum -= flux[i - w - 1];
    const cnt = Math.min(n - 1, i + w) - Math.max(0, i - w) + 1;
    const v = flux[i] - sum / cnt;
    out[i] = v > 0 ? v : 0;
  }
  return out;
}

/** How sharply the curve piles up when folded at one beat of `bpm`: high when the tempo is right. Also returns the fold. */
function fold(e: Float32Array, fps: number, bpm: number, bins: number, hist: Float64Array): number {
  hist.fill(0);
  const k = (bpm / 60 / fps) * bins;
  for (let i = 0; i < e.length; i++) {
    const v = e[i];
    if (v === 0) continue;
    const p = (i * k) % bins;
    const a = Math.floor(p), fr = p - a;
    hist[a] += v * (1 - fr);
    hist[a + 1 === bins ? 0 : a + 1] += v * fr;
  }
  let s = 0, s2 = 0;
  for (let b = 0; b < bins; b++) { s += hist[b]; s2 += hist[b] * hist[b]; }
  return s > 0 ? (s2 * bins) / (s * s) : 0;
}

export interface Tempo { bpm: number; /** Seconds into the file of the first beat (0 <= t0 < one beat). */ t0: number; /** 0..1: how clearly this tempo stood out. */ confidence: number }

/**
 * The beat phase at this tempo, in seconds from the start of a window: where the fold of the onset curve
 * is fullest. Off-beat hi-hats make as much flux as the kick drum, so the fold of the bass band is added
 * with more weight: between the beat and the off-beat, the one with the bass on it is the beat.
 */
function foldPhase(e: Float32Array, low: Float32Array, fps: number, bpm: number): number {
  const bins = 64, hist = new Float64Array(bins), histLow = new Float64Array(bins);
  fold(e, fps, bpm, bins, hist);
  fold(low, fps, bpm, bins, histLow);
  const top = (h: Float64Array) => { let m = 1e-12; for (let b = 0; b < bins; b++) if (h[b] > m) m = h[b]; return m; };
  const mA = top(hist), mL = top(histLow);
  // smooth a little, then take the peak with a parabola through its neighbours
  const mix = (b: number) => hist[b] / mA + 1.5 * (histLow[b] / mL);
  const sm = new Float64Array(bins);
  for (let b = 0; b < bins; b++) sm[b] = 0.25 * mix((b + bins - 1) % bins) + 0.5 * mix(b) + 0.25 * mix((b + 1) % bins);
  let pk = 0;
  for (let b = 1; b < bins; b++) if (sm[b] > sm[pk]) pk = b;
  const l = sm[(pk + bins - 1) % bins], c = sm[pk], r = sm[(pk + 1) % bins];
  const d = l - 2 * c + r;
  return ((pk + (d < 0 ? (0.5 * (l - r)) / d : 0)) / bins) * (60 / bpm);
}

/**
 * Onset nearest to every beat of the grid `phase + k * beat` (seconds, window time), as [k, time, weight].
 * Beats with no clear onset within 30 ms are left out.
 */
function beatOnsets(e: Float32Array, fps: number, beat: number, phase: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  const reach = Math.max(2, Math.round(fps * 0.03));
  let mean = 0;
  for (let i = 0; i < e.length; i++) mean += e[i];
  mean /= e.length || 1;
  for (let k = 0; ; k++) {
    const c = Math.round((phase + k * beat) * fps);
    if (c + reach + 1 >= e.length) break;
    let pk = -1, v = mean * 2;
    for (let i = Math.max(1, c - reach); i <= c + reach; i++) if (e[i] > v) { v = e[i]; pk = i; }
    if (pk < 0) continue;
    const l = e[pk - 1], r = e[pk + 1], d = l - 2 * v + r;
    out.push([k, (pk + (d < 0 ? (0.5 * (l - r)) / d : 0)) / fps, v]);
  }
  return out;
}

/** Weighted straight line through the beat onsets: [time of beat 0, beat length], or null with too few onsets. */
function fitBeats(on: [number, number, number][], fixedBeat?: number): [number, number] | null {
  if (on.length < 12) return null;
  let sw = 0, sk = 0, st = 0, skk = 0, skt = 0;
  for (const [k, t, w] of on) { sw += w; sk += w * k; st += w * t; skk += w * k * k; skt += w * k * t; }
  if (fixedBeat !== undefined) return [(st - fixedBeat * sk) / sw, fixedBeat];
  const den = sw * skk - sk * sk;
  if (Math.abs(den) < 1e-9) return null;
  const b = (sw * skt - sk * st) / den;
  return [(st - b * sk) / sw, b];
}

/**
 * Strength of the curve on the four beats of the bar for the grid `phase + k * beat`: [mean, unevenness].
 * Unevenness (spread / mean) is the telling part: what sits on the beats changes through the bar (kick,
 * snare, a new chord, the melody), while what sits between them (hi-hats, an off-beat bass) is the same
 * every time.
 */
function barShape(e: Float32Array, fps: number, beat: number, phase: number): [number, number] {
  const slot = [0, 0, 0, 0];
  const reach = Math.max(1, Math.round(beat * fps * 0.07));
  for (let k = 0; ; k++) {
    const c = Math.round((phase + k * beat) * fps);
    if (c + reach >= e.length) break;
    let s = 0;
    for (let i = Math.max(0, c - reach); i <= c + reach; i++) s += e[i];
    slot[k % 4] += s;
  }
  const mean = (slot[0] + slot[1] + slot[2] + slot[3]) / 4;
  if (mean <= 0) return [0, 0];
  let v = 0;
  for (const x of slot) v += (x - mean) * (x - mean);
  return [mean, Math.sqrt(v / 4) / mean];
}

/**
 * Beat or off-beat? Returns `phase` or `phase + half a beat`, whichever is the better beat.
 *   1. A stream that is the same on every beat of the bar (see barShape) while the other one is not, and
 *      that has no clear lead in the bass, is the off-beat: hi-hats, however loud.
 *   2. When both streams hit about equally hard, the one that changes more through the bar is the beat.
 *   3. Otherwise the beat is where most of the hits are. The bass alone is no guide here: an off-beat
 *      bass line is common.
 * Tuned on 32 rendered mixes (tests/fixtures/mixes.json holds a spread of them) and right on 31. The
 * miss has a steady hi-hat on the beat against an equally steady, louder bass between the beats; such
 * songs and syncopated drums can fool it, which is why the editor has a half-beat button.
 */
function settleHalfBeat(e: Float32Array, low: Float32Array, fps: number, beat: number, phase: number): number {
  const alt = phase + beat / 2;
  const [aAll, aU] = barShape(e, fps, beat, phase), [bAll, bU] = barShape(e, fps, beat, alt);
  const [aLow] = barShape(low, fps, beat, phase), [bLow] = barShape(low, fps, beat, alt);
  if (aU < 0.1 && bU > 2 * aU && aLow <= 1.25 * bLow) return alt;
  if (bU < 0.1 && aU > 2 * bU && bLow <= 1.25 * aLow) return phase;
  const lead = Math.log((aAll + 1e-9) / (bAll + 1e-9));
  if (Math.abs(lead) < 0.15) return bU > aU ? alt : phase;
  return lead < 0 ? alt : phase;
}

/** The phase moved onto the onsets that sit on its grid, the beat length kept. */
function onGrid(e: Float32Array, fps: number, beat: number, phase: number): number {
  const fit = fitBeats(beatOnsets(e, fps, beat, phase), beat);
  return fit ? fit[0] : phase;
}

const wrap = (t: number, beat: number): number => t - Math.floor(t / beat) * beat;

/** Steps 2 to 4: the tempo, inside the playable octave, and the beat phase. */
export function findTempo(env: Envelopes): Tempo {
  const { fps } = env;
  const e = sharpen(env.flux, fps), low = sharpen(env.low, fps);
  const n = e.length;
  if (n < fps * 4) return { bpm: 120, t0: 0, confidence: 0 };
  // autocorrelation up to four beats of the slowest tempo
  const maxLag = Math.min(n - 1, Math.ceil((fps * 60 * 4) / MIN_BPM) + 2);
  const acf = new Float64Array(maxLag + 1);
  for (let lag = 1; lag <= maxLag; lag++) { let s = 0; for (let i = 0; i + lag < n; i++) s += e[i] * e[i + lag]; acf[lag] = s / (n - lag); }
  const at = (lag: number): number => { const a = Math.floor(lag); return a + 1 > maxLag ? 0 : acf[a] + (acf[a + 1] - acf[a]) * (lag - a); };
  let best = MIN_BPM, bestS = -1, sum = 0, cnt = 0;
  for (let bpm = MIN_BPM; bpm < MAX_BPM; bpm += 0.25) {
    const lag = (fps * 60) / bpm;
    const s = at(lag) + 0.8 * at(lag * 2) + 0.6 * at(lag * 4);
    sum += s; cnt++;
    if (s > bestS) { bestS = s; best = bpm; }
  }
  const confidence = Math.max(0, Math.min(1, bestS > 0 ? 1 - sum / cnt / bestS : 0));
  // The autocorrelation cannot tell a tempo from its 4/3 and 2/3 relatives when the music is busy with
  // sixteenths, so all three are refined and compared.
  let pick: Refined | null = null;
  for (const ratio of [1, 4 / 3, 3 / 4]) {
    const r = refine(e, low, fps, playableBpm(best * ratio));
    if (!pick || r.score > pick.score) pick = r;
  }
  const beat = pick!.beat;
  const phase = onGrid(e, fps, beat, settleHalfBeat(e, low, fps, beat, pick!.phase));
  const bpm = playableBpm(60 / beat);
  // two decimals: finer than the method can tell, and a clean number for the player
  // and almost all produced music has a whole-number tempo: this close to one, it is that one
  const shown = Math.abs(bpm - Math.round(bpm)) <= 0.015 ? Math.round(bpm) : Math.round(bpm * 100) / 100;
  // folding by an octave keeps the phase: every beat of the slower grid is a beat of the faster one
  return { bpm: shown, t0: wrap(phase + LATENCY, 60 / shown), confidence };
}

interface Refined { beat: number; phase: number; score: number }

/**
 * Steps 3 and 4 for one candidate tempo: the exact beat length and phase near `bpm`, and how good a beat
 * it is. The score is how sharply the onsets pile up when folded at the beat, in the whole band and in the
 * bass, times how little the fold repeats itself three times over. That last part is what rejects the
 * relatives: a beat of four sixteenths folded at three (or six) of them gives three equal piles, because
 * every pile gets its share of beats and off-beats alike.
 */
function refine(e: Float32Array, low: Float32Array, fps: number, bpm0: number): Refined {
  const hist = new Float64Array(16);
  let fine = bpm0, fineS = -1;
  for (let bpm = bpm0 - 2.5; bpm <= bpm0 + 2.5; bpm += 0.005) {
    const s = fold(e, fps, bpm, 16, hist);
    if (s > fineS) { fineS = s; fine = bpm; }
  }
  // finest: a straight line through the onsets that sit on the beats (again on the corrected grid)
  let beat = 60 / fine, phase = foldPhase(e, low, fps, fine);
  for (let pass = 0; pass < 3; pass++) {
    const fit = fitBeats(beatOnsets(e, fps, beat, phase));
    if (!fit || Math.abs(60 / fit[1] - fine) > 0.5) break;
    [phase, beat] = fit;
  }
  const bpm = 60 / beat;
  const sharp = fold(e, fps, bpm, 16, hist) + fold(low, fps, bpm, 16, hist);
  const h = new Float64Array(48);
  fold(e, fps, bpm, 48, h);
  let mean = 0;
  for (let b = 0; b < 48; b++) mean += h[b] / 48;
  let same = 0, all = 1e-12;
  for (let b = 0; b < 48; b++) { same += (h[b] - mean) * (h[(b + 16) % 48] - mean); all += (h[b] - mean) * (h[b] - mean); }
  return { beat, phase, score: sharp * (1 - Math.max(0, Math.min(0.98, same / all))) };
}

/** Step 4 alone, for a tempo that is given (the player corrected it): seconds into the file of the first beat. */
export function findPhase(env: Envelopes, bpm: number): number {
  const e = sharpen(env.flux, env.fps);
  const beat = 60 / bpm;
  const low = sharpen(env.low, env.fps);
  let phase = foldPhase(e, low, env.fps, bpm);
  const fit = fitBeats(beatOnsets(e, env.fps, beat, phase), beat);
  if (fit) phase = fit[0];
  phase = onGrid(e, env.fps, beat, settleHalfBeat(e, low, env.fps, beat, phase));
  return wrap(phase + LATENCY, beat);
}

export interface Grid { loud: string; hits: string; /** Beat index the track should start on: the first bar line once the music has begun. */ first: number }

/** Step 5 and the per-beat features, for a beat grid `t0 + k * 60 / bpm`. */
export function gridFeatures(env: Envelopes, bpm: number, t0: number): Grid {
  const { fps, flux, low, rms } = env;
  const beat = 60 / bpm;
  const count = Math.max(0, Math.floor((env.duration - t0) / beat));
  const frame = (t: number) => Math.round((t - LATENCY) * fps);
  const str = new Float32Array(count), bass = new Float32Array(count), level = new Float32Array(count);
  const near = Math.max(1, Math.round(fps * 0.04));
  for (let k = 0; k < count; k++) {
    const c = frame(t0 + k * beat);
    let s = 0, b = 0;
    for (let i = Math.max(0, c - near); i <= Math.min(flux.length - 1, c + near); i++) { if (flux[i] > s) s = flux[i]; if (low[i] > b) b = low[i]; }
    str[k] = s; bass[k] = b;
    const a = Math.max(0, frame(t0 + k * beat)), z = Math.min(rms.length, frame(t0 + (k + 1) * beat));
    let e = 0;
    for (let i = a; i < z; i++) e += rms[i] * rms[i];
    level[k] = z > a ? Math.sqrt(e / (z - a)) : 0;
  }
  const pct = (v: Float32Array, p: number): number => { const s = Float32Array.from(v).sort(); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
  const ref = pct(level, 0.95) || 1e-9, strRef = pct(str, 0.95) || 1e-9;
  let loud = '', hits = '';
  for (let k = 0; k < count; k++) {
    const db = 20 * Math.log10(Math.max(1e-9, level[k]) / ref);
    loud += String(Math.max(0, Math.min(9, Math.round(9 + db / 2.5))));
    hits += String(Math.max(0, Math.min(9, Math.round((9 * str[k]) / strRef))));
  }
  // Which of the four beat positions carries the bar line: the one with the most bass, the strongest hits
  // and the biggest steps in loudness (four beats from it on against the four before it). A best guess:
  // without the harmony a bar line is hard to tell from the middle of the bar, so the editor lets the
  // player move the start by single beats.
  const B = CFG.beatsPerBar;
  const bassRef = pct(bass, 0.95) || 1e-9;
  const score = new Float64Array(B);
  for (let k = 0; k < count; k++) {
    let up = 0;
    if (k >= B && k + B <= count) {
      let before = 0, after = 0;
      for (let j = 1; j <= B; j++) { before += level[k - j]; after += level[k + j - 1]; }
      up = Math.max(0, (after - before) / (B * ref));
    }
    score[k % B] += bass[k] / bassRef + 0.5 * (str[k] / strRef) + 3 * up;
  }
  let phase = 0;
  for (let p = 1; p < B; p++) if (score[p] > score[phase]) phase = p;
  // the first such beat after the silence at the start of the file
  let begin = 0;
  while (begin < count && level[begin] < ref * 0.06) begin++;
  let first = begin;
  while (first % B !== phase) first++;
  if (first >= count) first = phase;
  return { loud, hits, first };
}

/** The whole analysis of one file. `env` is kept by the editor so a tempo correction does not need the samples again. */
export function analyse(mono: Float32Array, sampleRate: number, name: string): { music: TrackMusic; env: Envelopes; confidence: number } {
  const env = envelopes(mono, sampleRate);
  const tempo = findTempo(env);
  return { music: regrid(env, tempo.bpm, name, tempo.t0), env, confidence: tempo.confidence };
}

/** Beat grid and features for a given tempo (after the player corrected it). */
export function regrid(env: Envelopes, bpm: number, name: string, t0 = findPhase(env, bpm)): TrackMusic {
  const g = gridFeatures(env, bpm, t0);
  return { name, bpm, t0: Math.round(t0 * 10000) / 10000, first: g.first, duration: env.duration, loud: g.loud, hits: g.hits };
}

/** Mono mix of interleaved-by-channel data, as decodeAudioData delivers it. */
export function mixDown(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const n = channels[0].length, out = new Float32Array(n);
  for (const c of channels) for (let i = 0; i < n; i++) out[i] += c[i];
  const g = 1 / channels.length;
  for (let i = 0; i < n; i++) out[i] *= g;
  return out;
}
