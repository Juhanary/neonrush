import { BAR_ROWS, CFG } from './config';
import { F } from './figures';
import type { LevelDef } from './level';

/*
 * PLAYER-MADE TRACKS (the level editor, docs/EDITOR.md).
 *
 * A custom track is the same plain-text rows as an official one, in whole bars, plus the player's own
 * music. Like everywhere else the tempo and the speed are one number: with a music file the analysed
 * tempo sets the speed (speed = BPM / 5), so one beat of the song is three rows of road and whatever
 * is built on a beat row is passed on the beat.
 */

/** Every tile character a track may contain. */
export const TILES = '.=#^>oO*+mi|x';
/** Speeds the movement tuning can be played at, and the tempo range that gives (one octave). */
export const MIN_SPEED = 19, MAX_SPEED = 38;
export const MIN_BPM = MIN_SPEED * 5, MAX_BPM = MAX_SPEED * 5;
export const MIN_BARS = 4, MAX_BARS = 96;

/** What the analysis of a music file found (audio/analyze.ts). The file itself is stored separately. */
export interface TrackMusic {
  /** File name, shown to the player. */
  name: string;
  bpm: number;
  /** Seconds into the file of the first beat of the beat grid. */
  t0: number;
  /** Which beat of that grid is beat 0 of the track: moves the start by whole beats or bars. */
  first: number;
  /** Length of the file in seconds. */
  duration: number;
  /** Loudness of every beat of the grid, one digit 0..9 each. */
  loud: string;
  /** Strength of the hit on every beat of the grid, one digit 0..9 each. */
  hits: string;
}

export interface CustomLevel {
  v: 1;
  id: string;
  name: string;
  /** Palette index (render/palette.ts). */
  world: number;
  speed: number;
  /** Built-in song: the music of a track without a file, and the stand-in when the file is not on this device. */
  song: string;
  rows: string[];
  /** Bars inside a gravity-flip zone. */
  flipBars: number[];
  music?: TrackMusic;
  updated: number;
}

export function blankLevel(id: string, name: string, bars = 16): CustomLevel {
  return { v: 1, id, name, world: 0, speed: 24, song: 'cyan', rows: Array<string>(bars * BAR_ROWS).fill(F), flipBars: [], updated: 0 };
}

export const barsOf = (c: CustomLevel): number => Math.floor(c.rows.length / BAR_ROWS);
export const beatSeconds = (m: TrackMusic): number => 60 / m.bpm;
/** Seconds into the file where beat 0 of the track sounds. */
export const musicStart = (m: TrackMusic): number => m.t0 + m.first * beatSeconds(m);
/** How many whole bars of music there are from the start of the track to the end of the file. */
export const musicBars = (m: TrackMusic): number => Math.floor((m.duration - musicStart(m)) / (beatSeconds(m) * CFG.beatsPerBar));

/** Fold a tempo by octaves into the range the game can be played at. */
export function playableBpm(bpm: number): number {
  let b = bpm;
  while (b < MIN_BPM) b *= 2;
  while (b >= MAX_BPM) b /= 2;
  return b < MIN_BPM ? MIN_BPM : b;
}

/**
 * Music intensity 1..3 of each bar of the track, from the loudness and the hits of its beats, relative to
 * the rest of the part of the song the track uses: 1 near its quiet bars, 3 near its loud ones.
 */
export function musicEnergy(m: TrackMusic, bars: number): number[] {
  const f: number[] = [];
  for (let b = 0; b < bars; b++) {
    let sum = 0, n = 0;
    for (let k = 0; k < CFG.beatsPerBar; k++) {
      const i = m.first + b * CFG.beatsPerBar + k;
      if (i < 0 || i >= m.loud.length) continue;
      sum += 0.65 * +m.loud[i] + 0.35 * +(m.hits[i] ?? 0);
      n++;
    }
    f.push(n ? sum / n : 0);
  }
  const sorted = f.slice().sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
  // the span between the quiet and the loud bars, ignoring the odd extreme one
  const lo = q(0.1), hi = q(0.9);
  // a song that is equally loud throughout has no quiet or loud bars to tell apart
  if (hi - lo < 0.8) return f.map(() => 2);
  return f.map((v) => (v < lo + 0.35 * (hi - lo) ? 1 : v > lo + 0.72 * (hi - lo) ? 3 : 2));
}

/** Flip zones as row ranges: runs of consecutive flipped bars. */
export function flipRanges(flipBars: number[], bars: number): [number, number][] {
  const on = new Set(flipBars);
  const out: [number, number][] = [];
  for (let b = 0; b < bars; b++) {
    if (!on.has(b)) continue;
    let e = b;
    while (on.has(e + 1) && e + 1 < bars) e++;
    out.push([b * BAR_ROWS, (e + 1) * BAR_ROWS]);
    b = e;
  }
  return out;
}

/** Ids of custom tracks in save data and in LevelDef carry this prefix, so they never collide with official ones. */
export const CUSTOM_PREFIX = 'custom:';

/** The track as the simulation and the renderer take it. */
export function toDef(c: CustomLevel): LevelDef {
  const bars = barsOf(c);
  return {
    id: CUSTOM_PREFIX + c.id, name: c.name, world: c.world, speed: c.speed, song: c.song, rows: c.rows.slice(0, bars * BAR_ROWS),
    flips: flipRanges(c.flipBars, bars),
    energy: c.music ? musicEnergy(c.music, bars).join('') : undefined,
  };
}

/** Rebuild a stored track defensively: storage can hold anything. Returns null when it is not a track. */
export function sanitize(raw: unknown): CustomLevel | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<CustomLevel>;
  if (typeof r.id !== 'string' || !Array.isArray(r.rows)) return null;
  const bars = Math.max(MIN_BARS, Math.min(MAX_BARS, Math.floor(r.rows.length / BAR_ROWS)));
  const rows: string[] = [];
  for (let i = 0; i < bars * BAR_ROWS; i++) {
    const s = typeof r.rows[i] === 'string' ? r.rows[i] : F;
    rows.push(s.length === CFG.lanes && [...s].every((c) => TILES.includes(c)) ? s : F);
  }
  const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
  let music: TrackMusic | undefined;
  const m = r.music as Partial<TrackMusic> | undefined;
  if (m && typeof m.bpm === 'number' && isFinite(m.bpm) && m.bpm > 0 && typeof m.loud === 'string') {
    music = {
      name: String(m.name ?? ''), bpm: num(m.bpm, 120, MIN_BPM, MAX_BPM), t0: num(m.t0, 0, -5, 36000), first: Math.round(num(m.first, 0, -64, 100000)),
      duration: num(m.duration, 0, 0, 36000), loud: m.loud.replace(/[^0-9]/g, '0'), hits: String(m.hits ?? '').replace(/[^0-9]/g, '0'),
    };
  }
  return {
    v: 1, id: r.id, name: String(r.name ?? 'TRACK').slice(0, 24), world: Math.round(num(r.world, 0, 0, 99)),
    speed: music ? music.bpm / 5 : num(r.speed, 24, MIN_SPEED, MAX_SPEED), song: typeof r.song === 'string' ? r.song : 'cyan', rows,
    flipBars: Array.isArray(r.flipBars) ? r.flipBars.filter((b) => Number.isInteger(b) && b >= 0 && b < bars) : [],
    music, updated: num(r.updated, 0, 0, Number.MAX_SAFE_INTEGER),
  };
}
