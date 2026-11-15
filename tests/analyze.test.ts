import { describe, expect, it } from 'vitest';
import mixes from './fixtures/mixes.json';
import { analyse, envelopes, findPhase, findTempo, type Envelopes } from '../src/audio/analyze';
import { musicBars, musicEnergy, musicStart, playableBpm } from '../src/core/custom';
import { rng } from '../src/core/figures';

/**
 * Synthetic music with a known tempo and a known first beat: kick on every beat, snare on 2 and 4, hats on
 * the off-beats, a bass note per bar and some noise. `quiet` bars leave the drums out (for the energy test).
 */
function song(bpm: number, offset: number, seconds: number, sr = 44100, quiet: (bar: number) => boolean = () => false): Float32Array {
  const out = new Float32Array(Math.floor(seconds * sr));
  const rnd = rng(7);
  const beat = 60 / bpm;
  const add = (t: number, dur: number, f: (u: number) => number) => {
    const a = Math.round(t * sr), n = Math.floor(dur * sr);
    for (let i = 0; i < n && a + i < out.length; i++) if (a + i >= 0) out[a + i] += f(i / sr);
  };
  for (let k = 0; offset + k * beat < seconds; k++) {
    const t = offset + k * beat, bar = Math.floor(k / 4), q = quiet(bar);
    if (!q) add(t, 0.18, (u) => 0.8 * Math.sin(2 * Math.PI * (50 * u + 60 * (1 - Math.exp(-u * 30)) / 30)) * Math.exp(-u * 18));
    if (!q && k % 2 === 1) add(t, 0.12, (u) => 0.4 * (rnd() * 2 - 1) * Math.exp(-u * 30));
    if (!q) add(t + beat / 2, 0.04, (u) => 0.15 * (rnd() * 2 - 1) * Math.exp(-u * 90));
    if (k % 4 === 0) { const f = [55, 65.4, 73.4, 49][bar % 4]; add(t, beat * 3.9, (u) => (q ? 0.08 : 0.25) * Math.sin(2 * Math.PI * f * u) * Math.min(1, u * 200)); }
  }
  for (let i = 0; i < out.length; i++) out[i] += 0.004 * (rnd() * 2 - 1);
  return out;
}

describe('music analysis', () => {
  for (const [bpm, offset] of [[128, 0.37], [140.3, 0.05], [174, 0.2], [100, 0.41], [120, 0], [156.25, 0.11]] as const) {
    it(`finds ${bpm} BPM and the first beat at ${offset} s`, () => {
      const env = envelopes(song(bpm, offset, 60), 44100);
      const t = findTempo(env);
      expect(Math.abs(t.bpm - bpm)).toBeLessThan(0.01);
      const beat = 60 / bpm;
      // distance to the nearest true beat, for the phase that comes with the tempo and for the one found for a given tempo
      const off = (t0: number) => ((t0 - offset) % beat + beat * 1.5) % beat - beat / 2;
      console.info(bpm, 'found', t.bpm, 'phase error ms', (off(t.t0) * 1000).toFixed(2), (off(findPhase(env, bpm)) * 1000).toFixed(2));
      expect(Math.abs(off(t.t0))).toBeLessThan(0.004);
      expect(Math.abs(off(findPhase(env, bpm)))).toBeLessThan(0.004);
    });
  }

  it('folds a tempo outside the playable octave into it', () => {
    expect(playableBpm(87)).toBe(174);
    expect(playableBpm(200)).toBe(100);
    expect(playableBpm(128)).toBe(128);
    const t = findTempo(envelopes(song(87, 0.1, 50), 44100));
    expect(Math.abs(t.bpm - 174)).toBeLessThan(0.06);
  });

  it('works at 48 kHz too', () => {
    const t = findTempo(envelopes(song(132, 0.3, 40, 48000), 48000));
    expect(Math.abs(t.bpm - 132)).toBeLessThan(0.03);
  });

  it('starts the track on a bar line after the silence, and grades bars by loudness', () => {
    // bars 4..7 are a quiet breakdown, the rest is full
    const { music } = analyse(song(128, 1.2, 45, 44100, (b) => b >= 4 && b < 8), 44100, 'test');
    const beat = 60 / 128;
    const start = musicStart(music);
    const k = (start - 1.2) / beat;
    expect(Math.abs(k - Math.round(k))).toBeLessThan(0.02);
    expect(Math.round(k) % 4, 'starts on beat 1 of a bar').toBe(0);
    expect(Math.round(k)).toBe(0);
    const bars = musicBars(music);
    expect(bars).toBeGreaterThanOrEqual(22);
    const e = musicEnergy(music, 16);
    expect(e.slice(4, 8).every((v) => v === 1), e.join('')).toBe(true);
    expect(e.slice(0, 4).every((v) => v >= 2) && e.slice(8, 16).every((v) => v >= 2), e.join('')).toBe(true);
  });
});

/**
 * Real mixes: the built-in songs rendered offline with their full arrangement (quiet first bars, loud
 * later ones) and reduced to their onset curves by scripts/analyse.mjs. These are what taught the
 * analysis to tell a tempo from its 4/3 relative and the beat from the off-beat, so they are kept as a
 * fixture. The first note of every render is 0.05 s in, and the mix bus delays it by another 12 ms.
 */
describe('music analysis on full mixes', () => {
  const unpack = (p: { max: number; data: string }): Float32Array => {
    const bin = atob(p.data), out = new Float32Array(bin.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = ((bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8)) / 65535) * p.max;
    return out;
  };
  for (const m of mixes) {
    it(`${m.song} at ${m.bpm} BPM: tempo and beat`, () => {
      const env: Envelopes = { fps: m.fps, duration: m.duration, flux: unpack(m.flux), low: unpack(m.low), rms: unpack(m.rms) };
      const truth = m.bpm < 95 ? m.bpm * 2 : m.bpm;
      const t = findTempo(env);
      expect(Math.abs(t.bpm - truth), `found ${t.bpm}`).toBeLessThan(0.03);
      const beat = 60 / t.bpm;
      const off = (t0: number) => ((t0 - 0.062) % beat + beat * 1.5) % beat - beat / 2;
      expect(Math.abs(off(t.t0)), `first beat at ${t.t0}`).toBeLessThan(0.008);
      expect(Math.abs(off(findPhase(env, truth)))).toBeLessThan(0.008);
    });
  }
});
