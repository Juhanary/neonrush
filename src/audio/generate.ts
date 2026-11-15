import type { BassKind, LeadKind } from './engine';
import { checkSong } from './lint';
import { DORIAN, HARMONIC, KITS, MINOR, PHRYGIAN, SONGS, chordRoot, noteOf, type Song } from './songs';

/**
 * SONG GENERATOR. `generateSong(seed)` writes a complete song in the style of the night set: the same
 * seed always gives the same song, so a track only has to remember a name like `gen:4711:chase`.
 * It follows the method in docs/MUSIC.md: a hook made of one rhythmic cell repeated over three bars
 * while the pitch follows the chords, a different fourth bar, an answer phrase in contrast and a
 * sparse third phrase. No audio or DOM here, so it is unit tested (tests/songs.test.ts).
 *
 * What the level editor needs:
 *   generateSong(seed, { mood })   a Song object
 *   genName(seed, mood)            the name to store in LevelDef.song
 *   songByName(name)               built-in name, `gen:` name or registered name -> Song
 *   registerSong(name, song)       accept a pasted song (returns the problems, empty = accepted)
 *   describeSong(song)             one line for a list: key, chords, bass and lead
 */
export type Mood = 'chase' | 'night' | 'cold';
export const MOODS: Mood[] = ['chase', 'night', 'cold'];
export interface GenOptions { mood?: Mood }

interface Palette { kits: string[]; scales: number[][]; bass: BassKind[]; lead: LeadKind[]; busy: number; hard: number }
const PALETTE: Record<Mood, Palette> = {
  /** Fast and aggressive: driving kicks, distorted bass, a busy riff. */
  chase: { kits: ['DRIVE', 'RAVE', 'STOMP', 'DNB', 'BREAK', 'MARCH'], scales: [MINOR, PHRYGIAN, HARMONIC], bass: ['grit', 'fm', 'acid', 'growl', 'pluck'], lead: ['grit', 'saw', 'fm', 'square'], busy: 0.75, hard: 1 },
  /** Slow-burning and heavy: back-beat or half-time, a sparse hook with room in it. */
  night: { kits: ['WAVE', 'SLAM', 'HALF', 'MARCH', 'FOUR'], scales: [MINOR, DORIAN, PHRYGIAN], bass: ['grit', 'growl', 'wobble', 'sub', 'fm'], lead: ['hollow', 'fm', 'tri', 'square'], busy: 0.2, hard: 0.8 },
  /** Cold and broken: stuttering beats, glassy leads, long bass notes. */
  cold: { kits: ['GLITCH', 'DNB', 'HALF', 'BREAK'], scales: [DORIAN, MINOR, HARMONIC], bass: ['reese', 'fm', 'sub', 'growl'], lead: ['tri', 'bell', 'hollow', 'fm'], busy: 0.4, hard: 0.5 },
};

/** Chord loops that work in each scale (harmonic minor avoids its augmented and diminished chords). */
const CHORDS = new Map<number[], string[]>([
  [MINOR, ['1645', '1746', '1176', '6715', '1463', '1574', '1367', '1647']],
  [PHRYGIAN, ['1217', '1276', '1121', '1213', '1267']],
  [DORIAN, ['1473', '1417', '1437', '1247']],
  [HARMONIC, ['1465', '1645', '1415', '1654']],
]);
/** Tonics whose bass octave sits between G1 and D2: low enough to be a bass, high enough to be heard. */
const KEYS = [57, 58, 59, 60, 61, 62, 67, 68];

/** Bass lines for energy 1, 2, 3. Held notes for the basses that move by themselves, rhythms for the rest. */
const BASS_HELD: [string, string, string][] = [
  ['1---------------', '1-------..1-1---', '1-----1-..1-1-5-'],
  ['1-----------1---', '1-----1-..1-..1-', '1---1-1-..1-1-81'],
  ['1-------1-------', '1---1-..1-..1-1-', '1-1-..1-1-..1-81'],
  ['1-----------....', '1-------1---1-3-', '1-----1-1---1-5-'],
];
const BASS_RHYTHM: [string, string, string][] = [
  ['1-------1---1...', '1..1..1.1..1..1.', '11.1.11.11.1.18.'],
  ['1.........1.1...', '1.1...1.1.1...18', '1.11..1.1.11..18'],
  ['1.1...1.1.1...1.', '1.111.111.111.11', '1111118111111181'],
  ['1...1.1.1...1.1.', '1.1.1.8.1.1.1.8.', '1.81.81.1.81.818'],
  ['..1...1...1...1.', '..11..11..11..11', '.111.111.111.111'],
  ['1.....1.1.....1.', '1.1.81.1.1.83.1.', '1.1181.151.183.1'],
  ['1...1...1...1...', '1.1.1.1.1.1.1.1.', '1.1.8.1.1.1.8.5.'],
];
/** The sub bass is nearly a pure sine: it only gets lines with air in them, or the low end swamps the mix. */
const BASS_SUB: [string, string, string][] = [
  ['1.......1.......', '..1...1...1...1.', '..1.1.1...1.1.18'],
  ['1...1...1...1...', '1.1...1.1.1...1.', '1.1.8.1.1.1.8.1.'],
  ['1.......1...1...', '1..1..1.1..1..1.', '1..1..1.1..1.18.'],
];
const HELD_KINDS: BassKind[] = ['reese', 'wobble', 'growl'];
const ARPS = ['..8..5..8..5..3.', '1.3.5.8.5.3.8.5.', '..1...5...8...5.', '8.5.3.5.c.5.3.5.', '..8.5...8.5...3.', '1..5..8.1..5..8.', '5.8.5.c.5.8.5.c.', 'c.8.5.8.c.8.5.3.', '1.5.8.c.8.5.8.5.', '13581358a8531358'];
const STABS = ['......x.......x.', 'x..x..x.....x...', '..x...x...x..x..', 'x..x..x.x..x..x.', 'x.....x..x......', 'x..x....x..x....'];

/** Rhythm cells: x = a note starts, - = it is held, . = rest. */
const CELL_BUSY = ['x..x..x.x...x.x.', 'x.xx..x.x..x..x.', 'xx.x..x.x.x.x...', 'x.x..x.x..x..x..', 'x..x..x.x..x..x.', 'xxx...x.xxx...x.', 'x.x.x...x.x.x.x.'];
const CELL_SPARSE = ['x.....xx....x.x.', 'x..x..x...x.x...', 'x..x..x.x.......', 'x.....x.x...x...', 'x...x.....x.x...', 'x..x..x.x...x.x.'];
const CELL_LONG = ['x-----x---x-x---', 'x-------x---x-x-', 'x-----x-x-------', 'x-----------x---', 'x-----x-x---x---', 'x-------x-------'];
const CELL_TURN = ['x---x---x---x---', 'x-----x-x---x-x-', 'x---x---x-x-x---', 'x.x.x.x.x---x---', 'x---x---x-------', 'x-----x-x---x---'];
const CELL_STAB = ['x.x.....x.x.....', 'x..x..x.........', 'x.x.x...x.......', 'x.....x.x...x.x.', 'x...x...x...x.x.', 'x.x.x.....x.....'];

/** Small deterministic random generator (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Any seed (number or text) as an unsigned 32-bit number. */
function seedOf(seed: number | string): number {
  const s = String(seed);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const charOf = (step: number): string => (step < 0 ? String.fromCharCode(65 + step + 7) : step < 7 ? String.fromCharCode(49 + step) : String.fromCharCode(97 + step - 7));

export function generateSong(seed: number | string, opt: GenOptions = {}): Song {
  const mood = opt.mood ?? MOODS[seedOf(seed) % MOODS.length];
  const r = rng(seedOf(`${seed}/${mood}`)); // the mood is part of the seed: the same number gives three unrelated songs
  const pick = <T>(list: readonly T[]): T => list[Math.floor(r() * list.length)];
  const pal = PALETTE[mood];

  const key = pick(KEYS);
  const scale = pick(pal.scales);
  const chords = pick(CHORDS.get(scale)!);
  const bassKind = pick(pal.bass);
  const leadKind = pick(pal.lead);
  const held = HELD_KINDS.includes(bassKind);
  const song: Song = {
    key, scale, chords, kit: KITS[pick(pal.kits)],
    bass: { kind: bassKind, oct: Math.ceil((31 - key) / 12), pat: pick(held ? BASS_HELD : bassKind === 'sub' ? BASS_SUB : BASS_RHYTHM) },
    arp: { oct: Math.ceil((66 - key) / 12), pat: pick(ARPS), bright: 2400 + 200 * Math.floor(r() * 10), from: r() < 0.7 ? 2 : 3 },
    // a held bass alone is all low end, so with one the pad fills the middle from the first bar
    pad: { oct: Math.ceil((48 - key) / 12), from: held || r() < 0.6 ? 1 : 2, seventh: scale !== HARMONIC && r() < 0.4 },
    lead: { kind: leadKind, oct: key < 64 ? 1 : 0, A: [], B: [], C: [] },
    form: 'AABACABA',
  };
  if (r() < pal.hard) song.drums = 'hard';
  if (r() < 0.8) song.stab = pick(STABS);

  // ---- lead ------------------------------------------------------------------------------------
  // Scale steps the lead may use: everything that can be written (A..G, 1..7, a..g) and lands in MIDI 60..88.
  const legal: number[] = [];
  for (let s = -7; s <= 13; s++) { const n = noteOf(song, s, song.lead.oct); if (n >= 60 && n <= 88) legal.push(s); }
  /** Chord tones of a bar inside the legal range, low to high. */
  const tones = (bar: number): number[] => {
    const root = chordRoot(song, bar);
    return legal.filter((s) => [0, 2, 4].includes((((s - root) % 7) + 7) % 7));
  };
  const clamp = (s: number): number => Math.max(legal[0], Math.min(legal[legal.length - 1], s));

  /**
   * One bar. `cell` is the rhythm, `shape` says for each onset which chord tone to play, counted from
   * the chord tone nearest `centre` (0 = that one, 1 = the next one up ...), and `lean` adds a step
   * above or below on weak onsets. So the same shape over another chord gives the same figure, moved.
   */
  const write = (bar: number, cell: string, shape: number[], lean: number[], centre: number, bounce = false): string => {
    const ct = tones(bar), top = ct.length - 1;
    let base = 0;
    for (let i = 1; i < ct.length; i++) if (Math.abs(ct[i] - centre) < Math.abs(ct[base] - centre)) base = i;
    let out = '', k = 0;
    for (let s = 0; s < 16; s++) {
      if (cell[s] !== 'x') { out += cell[s]; continue; }
      let idx = base + shape[k % shape.length];
      // a walk that reaches the edge of the register turns around instead of repeating the last note
      if (bounce) { idx = ((idx % (2 * top)) + 2 * top) % (2 * top); if (idx > top) idx = 2 * top - idx; }
      idx = Math.max(0, Math.min(top, idx));
      const strong = s === 0 || s === 8;
      out += charOf(clamp(ct[idx] + (strong ? 0 : lean[k % lean.length])));
      k++;
    }
    return out;
  };
  const onsets = (cell: string): number => cell.split('x').length - 1;
  /** A figure: mostly repeated notes and neighbouring chord tones, at most one leap. */
  const shapeFor = (n: number, spread: number): number[] => {
    const out = [pick([0, 0, 1])];
    let leapt = false;
    for (let i = 1; i < n; i++) {
      const x = r();
      let d = x < 0.35 ? 0 : x < 0.65 ? -1 : x < 0.9 ? 1 : leapt ? 0 : 2;
      if (d === 2) leapt = true;
      out.push(Math.max(-spread, Math.min(spread, out[i - 1] + d)));
    }
    if (n > 1 && out.every((x) => x === out[0])) out[n - 1] += out[0] > 0 ? -1 : 1; // never a single repeated note
    return out;
  };
  const leanFor = (n: number, chance: number): number[] => Array.from({ length: n }, (_, i) => (i > 0 && r() < chance ? pick([-1, 1]) : 0));
  /** The fourth bar: walk the chord tones in one direction so it leads back to bar 1. */
  const turn = (bar: number, centre: number): string => {
    const cell = pick(CELL_TURN), n = onsets(cell);
    const down = r() < 0.6;
    const shape = Array.from({ length: n }, (_, i) => (down ? 1 - i : i - 1));
    return write(bar, cell, shape, [0], centre, true);
  };
  const phrase = (cells: string[], centre: number, leanChance: number): string[] => {
    const cell = pick(cells), n = onsets(cell);
    const shape = shapeFor(n, 2), lean = leanFor(n, leanChance);
    return [write(0, cell, shape, lean, centre), write(1, cell, shape, lean, centre), write(2, cell, shape, lean, centre), turn(3, centre)];
  };

  const low = legal[Math.floor(legal.length * 0.45)], high = legal[Math.floor(legal.length * 0.8)];
  const sustained = r() > pal.busy && r() < 0.35; // a hook of long notes, with the busy phrase as the answer
  if (sustained) {
    song.lead.A = phrase(CELL_LONG, high, 0);
    song.lead.B = phrase(CELL_BUSY, low, 0.2);
  } else {
    song.lead.A = phrase(r() < pal.busy ? CELL_BUSY : CELL_SPARSE, low, 0.25);
    song.lead.B = phrase(CELL_LONG, high, 0.15);
  }
  // C: a breakdown. One chord tone hammered out, with the last bar as a turn.
  const stab = pick(CELL_STAB), sn = onsets(stab);
  const flat = Array.from({ length: sn }, (_, i) => (i === sn - 1 && r() < 0.5 ? 1 : 0));
  song.lead.C = [write(0, stab, flat, [0], low), write(1, stab, flat, [0], low), write(2, stab, flat, [0], low), turn(3, low)];
  return song;
}

/** The name to store in a level for a generated song. */
export const genName = (seed: number | string, mood?: Mood): string => `gen:${seed}${mood ? ':' + mood : ''}`;

const custom = new Map<string, Song>();
const made = new Map<string, Song>();

/** Accept a song from outside (pasted into the editor). Returns the problems; an empty list means it is now playable by `name`. */
export function registerSong(name: string, song: Song): string[] {
  if (SONGS[name] || name.startsWith('gen:')) return [`name: "${name}" is taken`];
  let problems: string[];
  try { problems = checkSong(song); } catch (err) { problems = ['not a song: ' + String(err)]; }
  if (!problems.length) custom.set(name, song);
  return problems;
}

/** A song by name: built in, registered, or generated from a `gen:<seed>[:<mood>]` name. Undefined if the name means nothing. */
export function songByName(name: string): Song | undefined {
  if (SONGS[name]) return SONGS[name];
  if (custom.has(name)) return custom.get(name);
  const m = /^gen:([^:]+)(?::(chase|night|cold))?$/.exec(name);
  if (!m) return undefined;
  let song = made.get(name);
  if (!song) { song = generateSong(m[1], { mood: m[2] as Mood | undefined }); made.set(name, song); }
  return song;
}

const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
/** One line for a song list, e.g. "C# minor · 1643 · grit bass · hollow lead". */
export function describeSong(song: Song): string {
  const scale = song.scale[2] === 4 ? 'major' : song.scale[6] === 11 ? 'harmonic minor' : song.scale[1] === 1 ? 'phrygian' : song.scale[5] === 9 ? 'dorian' : 'minor';
  return `${NOTE[((song.key % 12) + 12) % 12]} ${scale} · ${song.chords} · ${song.bass.kind} bass · ${song.lead.kind} lead`;
}
