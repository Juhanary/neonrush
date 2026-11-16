import type { BassKind, LeadKind, Voices } from './engine';

/**
 * SONGS ARE DATA. One song = a key, a four-bar chord loop, a drum kit, a bass line, an arpeggio,
 * a pad and two four-bar lead phrases (A = the hook, B = the answer). `playStep` turns that into sound,
 * one sixteenth at a time, and thins or thickens the arrangement with the `energy` of the bar (1..3),
 * which comes from the track (Level.energyOf). See docs/MUSIC.md for how to write one.
 *
 * NOTATION (every pattern is 16 characters = one bar of sixteenths)
 *   drums   x = hit, X = accent, o = ghost (quiet), . = rest
 *   notes   1..7 = scale degree, a..g = the same degrees one octave up, A..G = one octave down,
 *           - = hold the previous note, . = rest.
 *           In `lead` the degrees count from the key note; in `bass` and `arp` from the root of the
 *           current chord (so 1 3 5 are always chord tones and 8 / a is the octave).
 *   chords  one digit per bar: the scale degree the chord is built on (diatonic triad).
 *
 * `checkSong` (lint.ts) verifies all of this; `generateSong` (generate.ts) writes songs in the same format.
 */
export interface Kit { kick: string; snare: string; clap: string; hat: string; open: string; perc: string }

export interface Song {
  /** MIDI note of the tonic in the lead's home octave. */
  key: number;
  scale: number[];
  chords: string;
  /** Drum patterns for energy 1, 2, 3. */
  kit: [Kit, Kit, Kit];
  bass: { kind: BassKind; oct: number; pat: [string, string, string] };
  arp: { oct: number; pat: string; bright: number; from: number };
  pad: { oct: number; from: number; seventh?: boolean };
  /** A = the hook, B = the answer, C = an optional third phrase (a breakdown) for tracks longer than 16 bars. */
  lead: { kind: LeadKind; oct: number; A: string[]; B: string[]; C?: string[] };
  /** Which lead phrase each four-bar phrase plays ('-' = none). Loops. */
  form: string;
  /** 'hard' = saturated kick, ringing snare and metal percussion (the industrial sets). */
  drums?: 'hard';
  /** Chord-hit rhythm at energy 3. */
  stab?: string;
  /** Tempo for songs that are not tied to a track (the menu). */
  bpm?: number;
  /** Bars after which a free-running song loops. */
  loop?: number;
  /** Energy per bar for a free-running song. */
  energy?: string;
}

export const MINOR = [0, 2, 3, 5, 7, 8, 10], MAJOR = [0, 2, 4, 5, 7, 9, 11], PHRYGIAN = [0, 1, 3, 5, 7, 8, 10], DORIAN = [0, 2, 3, 5, 7, 9, 10];
/** Harmonic minor: the raised seventh makes chord 5 major. Avoid chords 3 and 7 (augmented, diminished). */
export const HARMONIC = [0, 2, 3, 5, 7, 8, 11];

const k = (kick: string, snare: string, clap: string, hat: string, open: string, perc = '................'): Kit => ({ kick, snare, clap, hat, open, perc });
const NONE = '................';

/** Four on the floor. */
const FOUR: [Kit, Kit, Kit] = [
  k('x...x...x...x...', NONE, NONE, '..x...x...x...x.', NONE),
  k('x...x...x...x...', NONE, '....x.......x...', 'o.x.o.x.o.x.o.x.', '..x...x...x...x.'),
  k('x...x...x...x..o', '.......o......o.', '....x.......x...', 'xoxoxoxoxoxoxoxo', '..x...x...x...x.', '...x..x...x..x..'),
];
/** Syncopated breakbeat. */
const BREAK: [Kit, Kit, Kit] = [
  k('x.........x.....', '....x.......x...', NONE, 'x.x.x.x.x.x.x.x.', NONE),
  k('x.....x...x.....', '....x..o.o..x...', NONE, 'x.x.x.x.x.x.x.x.', '..............x.'),
  k('x.....x...x..x..', '....x..o.o..x..o', '....x.......x...', 'xoxoxoxoxoxoxoxo', '......x.......x.', '..x......x......'),
];
/** Half-time: one heavy snare per bar. */
const HALF: [Kit, Kit, Kit] = [
  k('x...............', '........x.......', NONE, 'x...x...x...x...', NONE),
  k('x.........x.....', '........x.......', '........x.......', 'x.x.x.x.x.x.x.x.', NONE),
  k('x..x......x..x..', '........x.....o.', '........x.......', 'x.xxx.x.x.xxx.xo', '......x.........', '...x.....x.x....'),
];
/** Two-step drum and bass. */
const DNB: [Kit, Kit, Kit] = [
  k('x.........x.....', '....x.......x...', NONE, 'x.x.x.x.x.x.x.x.', NONE),
  k('x.........x.....', '....x..o....xo..', NONE, 'xoxoxoxoxoxoxoxo', '..x.......x.....'),
  k('x.....x...x.....', '....x..o.o..x..o', '....x.......x...', 'xoxoxoxoxoxoxoxo', '..x...x...x.....', '.....x.......x..'),
];
/** Synthwave: big back-beat, driving eighths. */
const WAVE: [Kit, Kit, Kit] = [
  k('x.......x.......', '....x.......x...', NONE, 'x.x.x.x.x.x.x.x.', NONE),
  k('x.......x.x.....', '....x.......x...', '....x.......x...', 'x.x.x.x.x.x.x.x.', '..............x.'),
  k('x.....x.x.x.....', '....x.......x..o', '....x.......x...', 'xoxoxoxoxoxoxoxo', '......x.......x.', '..........x..x.x'),
];

/** Darksynth drive: kick on every beat, a huge backbeat snare, rolling sixteenths. */
const DRIVE: [Kit, Kit, Kit] = [
  k('x...x...x...x...', '....x.......x...', NONE, 'x.x.x.x.x.x.x.x.', NONE),
  k('x...x...x...x...', '....X.......X...', '....x.......x...', 'xoxoxoxoxoxoxoxo', '..x...x...x...x.'),
  k('x...x...x..xx...', '....X..o....X.oo', '....x.......x...', 'xxoxxxoxxxoxxxox', '..x...x...x...x.', '.x.....x.x......'),
];

/** Industrial techno: no backbeat, the kick and struck metal carry it. */
const STOMP: [Kit, Kit, Kit] = [
  k('x...x...x...x...', NONE, NONE, '..x...x...x...x.', NONE, '.......x........'),
  k('x...x...x...x.x.', NONE, NONE, 'x.xxx.xxx.xxx.xx', '..x...x...x...x.', '...x.....x.....x'),
  k('x..xx...x..xx.x.', '............X...', '............x...', 'xxxxxxxxxxxxxxxx', '..x...x...x...x.', '.x...x.x.x...x..'),
];
/** Broken, stuttering beat. */
const GLITCH: [Kit, Kit, Kit] = [
  k('x.....x.........', '........x.......', NONE, 'x..x..x.x..x..x.', NONE),
  k('x..x..x...x.....', '....x.......x.o.', NONE, 'x.xxo.x.xxo.x.xx', '.......x........', '..x......x...x..'),
  k('x..x..x..xx...x.', '....X..o....X.oo', '....x.......x...', 'xxoxxxoxxoxxxoxx', '......x.......x.', '.x...x...x.x...x'),
];
/** Slow-motion half-time with rolling hats. */
const SLAM: [Kit, Kit, Kit] = [
  k('x.........x.....', '........X.......', NONE, 'x...x...x...x...', NONE),
  k('x.....x...x.....', '........X.......', '........x.......', 'x.x.x.xxx.x.x.x.', NONE, '....x.......x...'),
  k('x..x..x...x..x..', '........X.....oo', '........x.......', 'x.xxx.xxx.xxxxxx', '....x.......x...', '..x...x..x...x..'),
];
/** EBM march: kick on every beat, a snare with a pick-up before it, plain eighth hats. */
const MARCH: [Kit, Kit, Kit] = [
  k('x...x...x...x...', NONE, NONE, '....x.......x...', NONE),
  k('x...x...x...x...', '...oX......oX...', NONE, 'x.x.x.x.x.x.x.x.', NONE, '..x.......x.....'),
  k('x...x...x.x.x...', '...oX..o...oX.o.', '....x.......x...', 'x.x.x.x.x.x.x.x.', NONE, '..x..x....x..x..'),
];
/** Rave: four on the floor, claps, open hats on every off-beat. */
const RAVE: [Kit, Kit, Kit] = [
  k('x...x...x...x...', NONE, NONE, '..x...x...x...x.', NONE),
  k('x...x...x...x...', NONE, '....x.......x...', 'xoxoxoxoxoxoxoxo', '..x...x...x...x.'),
  k('x...x...x...x.xx', '.......o.....ooo', '....x.......x...', 'xxxxxxxxxxxxxxxx', '..x...x...x...x.', '...x.....x......'),
];

/** Every drum kit by name (the song generator and the editor pick from these). */
export const KITS: Record<string, [Kit, Kit, Kit]> = { FOUR, BREAK, HALF, DNB, WAVE, DRIVE, STOMP, GLITCH, SLAM, MARCH, RAVE };

export const SONGS: Record<string, Song> = {
  /** Menu theme: F#m D A E, a sung-style hook that repeats its first bar three times. */
  menu: {
    key: 69, scale: MAJOR, chords: '6415', kit: WAVE, bpm: 112, loop: 16, energy: '2222 3333 2233 3333',
    bass: { kind: 'pluck', oct: -3, pat: ['1...1...1...1...', '1.1.1.1.1.1.1.1.', '1.1.8.1.1.1.8.5.'] },
    arp: { oct: 0, pat: '1.5.8.5.a.5.8.5.', bright: 3000, from: 1 },
    pad: { oct: -2, from: 1, seventh: true },
    lead: {
      kind: 'square', oct: 0,
      A: ['3.3.321.3.....12', '3.3.321.F.......', '3.3.321.5...3.2.', '2...1.G.2.......'],
      B: ['5.5.535.6...5.3.', '6.6.656.a...6.5.', '5.5.535.a...b.c.', 'b---a-7-b-------'],
    },
    form: 'AABA', stab: 'x.....x...x.....',
  },
  /** World 1, 120 BPM: A minor arpeggio house. The hook climbs one chord tone per bar. */
  cyan: {
    key: 69, scale: MINOR, chords: '1637', kit: FOUR,
    bass: { kind: 'sub', oct: -3, pat: ['1.......1.......', '..1...1...1...1.', '..1.1.1...1.1.18'] },
    arp: { oct: 0, pat: '135813581358a853', bright: 3400, from: 1 },
    pad: { oct: -1, from: 1 },
    lead: {
      kind: 'square', oct: 0,
      A: ['5.543.1...345...', '6.654.3...456...', '7.765.3...57a...', 'b...7...4.5.....'],
      B: ['a---7-5---3-5---', '6---5-4---3-4---', '5---7-a---b-c---', 'b-----7-b-a-7-5-'],
    },
    form: 'AABA', stab: '..x...x...x...x.',
  },
  /** World 2, 130 BPM: D major breakbeat with a bouncing supersaw lead. */
  solar: {
    key: 62, scale: MAJOR, chords: '1564', kit: BREAK,
    bass: { kind: 'pluck', oct: -2, pat: ['1.....1...1.....', '1..1..1.1..1..1.', '1..1..1.1..1.18.'] },
    arp: { oct: 1, pat: '1.3.5.3.8.5.3.5.', bright: 4200, from: 2 },
    pad: { oct: 0, from: 1 },
    lead: {
      kind: 'saw', oct: 1,
      A: ['3.3.5.321...123.', '2.2.5.21G...G12.', '1.1.3.1GF...FG1.', '4.4.3.2.1.2.3.5.'],
      B: ['5--5--6-5-3-1---', '5--5--6-5-2-G---', '6--6--a-7-6-5-3-', '4---3---2---5---'],
    },
    form: 'AABA', stab: 'x..x..x...x..x..',
  },
  /** World 3, 140 BPM: E phrygian half-time with a wobble bass and an eerie triangle lead. */
  toxic: {
    key: 64, scale: PHRYGIAN, chords: '1127', kit: HALF,
    bass: { kind: 'wobble', oct: -2, pat: ['1-------1-------', '1-------1---1-3-', '1-----1-1---1-5-'] },
    arp: { oct: 1, pat: '1..5..8..5..1.5.', bright: 2600, from: 2 },
    pad: { oct: -1, from: 1 },
    lead: {
      kind: 'tri', oct: 1,
      A: ['1..21...5..43...', '1..21...7..a7.5.', '2..32...6..54...', '1.G.1.2.1---....'],
      B: ['a.7.5.7.a...b.a.', '7.5.4.5.7.......', 'b.a.7.a.b...c.b.', 'a---7---5-4-2-1-'],
    },
    form: 'AABA',
  },
  /** World 4, 145 BPM: F minor two-step with glass bells over a reese bass. */
  frost: {
    key: 65, scale: MINOR, chords: '1637', kit: DNB,
    bass: { kind: 'reese', oct: -3, pat: ['1---------1-----', '1-------..1-1-..', '1-----1-..1-1-5-'] },
    arp: { oct: 1, pat: '5.3.1.3.5.3.8.3.', bright: 3000, from: 2 },
    pad: { oct: 0, from: 1, seventh: true },
    lead: {
      kind: 'bell', oct: 1,
      A: ['5..3..1..3..5...', '6..3..1..3..6...', '7..5..3..5..7...', 'b..7..4..7..b.a.'],
      B: ['c--ba-7-5---7-a-', 'a--76-4-3---4-6-', 'c--ba-7-5-7-a-c-', 'd---c---b---7---'],
    },
    form: 'AABA',
  },
  /** World 5, 150 BPM: A minor acid techno. The bass line is the star; the lead only punctuates. */
  gravity: {
    key: 69, scale: MINOR, chords: '1176', kit: FOUR,
    bass: { kind: 'acid', oct: -3, pat: ['1...1..8..1...1.', '1.181.31.181.3.7', '11813181.181a3.7'] },
    arp: { oct: 1, pat: '..5...8...5...a.', bright: 2400, from: 2 },
    pad: { oct: -1, from: 2 },
    lead: {
      kind: 'saw', oct: 0,
      A: ['5...5.5...7.5...', '5...5.5...a.7...', '4...4.4...6.4...', '3.4.5.7.a.......'],
      B: ['a..7..5..7..a...', 'c..a..7..a..c...', 'b..7..5..4..5...', '7---5---a-------'],
    },
    form: 'AABA', stab: '....x.......x...',
  },
  /** World 6, 155 BPM: E minor big beat with a driving one-note riff. */
  ember: {
    key: 64, scale: MINOR, chords: '1675', kit: BREAK,
    bass: { kind: 'pluck', oct: -2, pat: ['1.1...1.1.....1.', '11.1.1.11.1.1.1.', '11.1.181.1.11.85'] },
    arp: { oct: 1, pat: '1.1.5.1.8.1.5.1.', bright: 3000, from: 3 },
    pad: { oct: 0, from: 2 },
    lead: {
      kind: 'saw', oct: 0,
      A: ['11.1.3.1.G.1..5.', '11.1.3.1.4.3..1.', '22.2.4.2.1.2..5.', '5.4.3.2.3.2.1.G.'],
      B: ['e---d---c--ba---', 'c---b---a--75---', 'd---c---b--a7---', '7-a-b-c-d---e---'],
    },
    form: 'AABA', stab: 'x.....x.x.....x.',
  },
  /** World 7, 160 BPM: D minor electro with a square arpeggio lead. */
  volt: {
    key: 62, scale: MINOR, chords: '1637', kit: FOUR,
    bass: { kind: 'sub', oct: -2, pat: ['1...1...1...1...', '1.1...1.1.1...1.', '1.1.8.1.1.1.8.1.'] },
    arp: { oct: 1, pat: '8.5.3.5.8.5.3.5.', bright: 3800, from: 3 },
    pad: { oct: 0, from: 1 },
    lead: {
      kind: 'square', oct: 0,
      A: ['1.3.5.a.5.3.5.7.', '6.a.c.a.6.a.6.4.', '3.5.7.5.3.5.c.a.', '7.b.d.b.7.5.4.2.'],
      B: ['e--c--a---7-a---', 'd--a--6---5-6---', 'c--a--7---5-7---', 'b---a---7---5-4-'],
    },
    form: 'AABA', stab: '..x..x....x..x..',
  },
  /** World 9, 170 BPM: G minor darksynth. Galloping bass, a three-note riff that climbs with the chords. */
  horizon: {
    key: 67, scale: MINOR, chords: '1674', kit: DRIVE,
    bass: { kind: 'pluck', oct: -2, pat: ['1...1...1...1...', '1.1.1.1.1.1.1.1.', '1.181.181.181.18'] },
    arp: { oct: 1, pat: '13581358a8531358', bright: 4200, from: 2 },
    pad: { oct: -1, from: 1, seventh: true },
    lead: {
      kind: 'saw', oct: 0,
      A: ['5..5..4.3...1.3.', '6..6..5.3...1.3.', '7..7..6.4...2.4.', 'a...7...6.5.4.5.'],
      B: ['c-----b-a---7---', 'a-----7-6---5---', '7-----a-b---c---', 'd---c---b---a---'],
    },
    form: 'AABA', stab: 'x..x..x...x..x..',
  },
  /** World 8, 165 BPM: F# minor drum and bass anthem with a wide supersaw lead. */
  zero: {
    key: 66, scale: MINOR, chords: '1637', kit: DNB,
    bass: { kind: 'reese', oct: -3, pat: ['1-------1-------', '1-----1-..1-1-..', '1---1-1-..1-1-58'] },
    arp: { oct: 1, pat: '1358a853135ac8a5', bright: 3600, from: 2 },
    pad: { oct: 0, from: 1, seventh: true },
    lead: {
      kind: 'saw', oct: 0,
      A: ['5-----3-5---7---', '6-----4-6---a---', '7-----5-7---b---', 'b---a---7-5-4-2-'],
      B: ['a-a-7-5-a-a-7-c-', 'a-a-6-4-a-a-6-c-', 'c-c-a-7-c-c-e-c-', 'd---c---b---a-7-'],
    },
    form: 'AABA', stab: 'x.....x...x.....',
  },
  // ---- THE NIGHT SET ----------------------------------------------------------------------------
  // One song per world in a dark industrial / cyberpunk style: distorted basses, saturated drums,
  // short menacing riffs. Each has a third phrase (C) and an eight-phrase form, so a track longer
  // than 16 bars does not simply repeat. The older set above stays available by name.

  /** World 1, 120 BPM: C# minor night drive. A falling 3-3-2 figure on a hollow lead over a gritty bass. */
  drift: {
    key: 61, scale: MINOR, chords: '1643', kit: WAVE, drums: 'hard',
    bass: { kind: 'grit', oct: -2, pat: ['1-------1---1...', '1..1..1.1..1..1.', '11.1.11.11.1.18.'] },
    arp: { oct: 1, pat: '..8..5..8..5..3.', bright: 2600, from: 2 },
    pad: { oct: -1, from: 1, seventh: true },
    lead: {
      kind: 'hollow', oct: 0,
      A: ['5..3..1.5...3.2.', '6..3..1.6...3.2.', '6..4..1.6...4.3.', '3-----5-7---5-2-'],
      B: ['c-----b-a---5---', 'c-----a-6---a---', 'd-----c-a---6---', '7---5---3---5-7-'],
      C: ['1...5...a...7.5.', '1...6...a...c.a.', '4...6...a...d.a.', '3...5...7---b---'],
    },
    form: 'AABACABA', stab: '......x.......x.',
  },
  /** World 2, 130 BPM: G harmonic minor breakbeat. A stabbing riff that drops to the leading tone, over an FM bass. */
  flare: {
    key: 67, scale: HARMONIC, chords: '1465', kit: BREAK, drums: 'hard',
    bass: { kind: 'fm', oct: -3, pat: ['1.........1.1...', '1.1...1.1.1...18', '1.11..1.1.11..18'] },
    arp: { oct: 0, pat: '1.3.5.8.5.3.8.5.', bright: 3200, from: 2 },
    pad: { oct: -1, from: 2 },
    lead: {
      kind: 'grit', oct: 0,
      A: ['1.13..5.3..1..G.', '4.46..a.6..4..3.', '6.6a..c.a..6..5.', '5.7.b.7.5---7---'],
      B: ['e-----c-a-------', 'd-----c-a---6---', 'c-----a-c---d---', 'b-----a-7-------'],
      C: ['1..1..1.........', '4..4..4.....3.4.', '6..6..6.........', '5..5..7.b...7...'],
    },
    form: 'AABACABA', stab: 'x..x..x.....x...',
  },
  /** World 3, 140 BPM: D# phrygian half-time. The flat second leans on every phrase; a growling bass holds the floor. */
  pulse: {
    key: 63, scale: PHRYGIAN, chords: '1217', kit: SLAM, drums: 'hard',
    bass: { kind: 'growl', oct: -2, pat: ['1---------------', '1-------..1-1---', '1-----1-..1-1-2-'] },
    arp: { oct: 1, pat: '..1...5...8...5.', bright: 2400, from: 2 },
    pad: { oct: -1, from: 1 },
    lead: {
      kind: 'fm', oct: 0,
      A: ['5.....65....3.1.', '6.....76....4.2.', 'a.....ba....5.3.', 'b---7---4---2---'],
      B: ['c-------a---b-a-', 'd-------b---c-b-', 'e-------c---d-c-', 'd---b---7-------'],
      C: ['1.1.....1.1.....', '2.2.....2.2...4.', '1.1.....1.1.....', 'G.G...2.4...G...'],
    },
    form: 'AABACABA', stab: '......x.......x.',
  },
  /** World 4, 145 BPM: B dorian broken beat. A cold triangle figure with gaps in it over a reese bass. */
  line: {
    key: 59, scale: DORIAN, chords: '1473', kit: GLITCH, drums: 'hard',
    bass: { kind: 'reese', oct: -2, pat: ['1-----------1---', '1-----1-..1-..1-', '1---1-1-..1-1-81'] },
    arp: { oct: 1, pat: '8.5.3.5.c.5.3.5.', bright: 3600, from: 2 },
    pad: { oct: 0, from: 1, seventh: true },
    lead: {
      kind: 'tri', oct: 1,
      A: ['5..1..3...5.3...', '6..1..4...6.4...', '7..2..4...7.4...', '5---3---5-3-5-7-'],
      B: ['a-----7-5-------', 'a-----6-4-------', 'b-----7-4-------', 'c---a---7---5---'],
      C: ['5.5.5...3.......', '6.6.6...4.......', '7.7.7...4.......', '5.5.5...7...a...'],
    },
    form: 'AABACABA',
  },
  /** World 5, 150 BPM: G# minor industrial techno. A two-bar question and answer on one chord; long notes for the flip zone. */
  well: {
    key: 68, scale: MINOR, chords: '1167', kit: STOMP, drums: 'hard',
    bass: { kind: 'acid', oct: -3, pat: ['1.....1.1.....1.', '1.1.81.1.1.83.1.', '1.1181.151.183.1'] },
    arp: { oct: 1, pat: '..8.5...8.5...3.', bright: 2400, from: 2 },
    pad: { oct: -1, from: 2 },
    lead: {
      kind: 'hollow', oct: 0,
      A: ['1.1..3.1..5..3..', '1.1..3.1..5..7..', '6.6..a.6..c..a..', '7---b---d---b-7-'],
      B: ['a-----------7---', '5-------3---5---', '6-------a-------', 'b-------d---b---'],
      C: ['5...5...5...5.7.', '5...5...5...3.1.', '6...6...6...6.a.', '7...7...b...d...'],
    },
    form: 'AABACABA', stab: '..x...x...x..x..',
  },
  /** World 6, 155 BPM: A# phrygian chase. A galloping riff that falls 3, flat 2, 1 and steps up with the chords. */
  rush: {
    key: 58, scale: PHRYGIAN, chords: '1276', kit: DRIVE, drums: 'hard',
    bass: { kind: 'grit', oct: -2, pat: ['1.1...1.1.1...1.', '1.111.111.111.11', '1111118111111181'] },
    arp: { oct: 1, pat: '1..5..8.1..5..8.', bright: 3000, from: 3 },
    pad: { oct: 0, from: 2 },
    lead: {
      kind: 'fm', oct: 1,
      A: ['11.1..5.3.2.1...', '22.2..6.4.3.2...', '44.4..7.6.5.4...', '6---5---3---2---'],
      B: ['c-----b-a---5---', 'd-----b-6---b---', 'd-----b-7---b---', 'c-----a-c---b---'],
      C: ['1.....1.1...2.1.', '2.....2.2...3.2.', 'G.....G.G...1.G.', '6...5...3...2...'],
    },
    form: 'AABACABA', stab: 'x..x..x.x..x..x.',
  },
  /** World 7, 160 BPM: C minor EBM. A stuttered three-note burst that jumps to a chord tone, over an FM bass in octaves. */
  storm: {
    key: 60, scale: MINOR, chords: '1746', kit: MARCH, drums: 'hard',
    bass: { kind: 'fm', oct: -2, pat: ['1...1.1.1...1.1.', '1.1.1.8.1.1.1.8.', '1.81.81.1.81.818'] },
    arp: { oct: 1, pat: '5.8.5.c.5.8.5.c.', bright: 3800, from: 3 },
    pad: { oct: 0, from: 1 },
    lead: {
      kind: 'square', oct: 0,
      A: ['aaa...c.aaa...e.', '777...b.777...d.', '666...a.666...d.', 'c---b---a---7-b-'],
      B: ['e-------c---d-c-', 'd-------b---c-b-', 'f-------d---e-d-', 'c---a---6---b---'],
      C: ['a.....a.....c.a.', '7.....7.....b.7.', '6.....6.....a.6.', '6..6..a..a..c.b.'],
    },
    form: 'AABACABA', stab: 'x.....x..x......',
  },
  /** World 8, 165 BPM: F# harmonic minor drum and bass. The hook is long notes (two flip zones); the answer is the busy one, calm again in its last bar. */
  point: {
    key: 66, scale: HARMONIC, chords: '1645', kit: DNB, drums: 'hard',
    bass: { kind: 'growl', oct: -3, pat: ['1-----------1---', '1---1-..1-..1-1-', '1-1-..1-1-..1-81'] },
    arp: { oct: 1, pat: 'c.8.5.8.c.8.5.3.', bright: 3400, from: 2 },
    pad: { oct: 0, from: 1 },
    lead: {
      kind: 'grit', oct: 0,
      A: ['5-----a---b-a---', '6-----a---c-a---', '6-----a---d-a---', 'b---7---b---e---'],
      B: ['a.a.c.a.5...a...', 'a.a.c.a.6...a...', 'a.a.d.a.6...d...', 'b---e---7---5---'],
      C: ['5-------3-------', '6-------3-------', '6-------4-------', '5---7---b---e---'],
    },
    form: 'AABACABA', stab: 'x..x....x..x....',
  },
  /** World 9, 170 BPM: A minor rave finale. The chords climb F, G, Am and the riff climbs with them; off-beat rolling bass. */
  neon: {
    key: 69, scale: MINOR, chords: '6715', kit: RAVE, drums: 'hard',
    bass: { kind: 'grit', oct: -3, pat: ['..1...1...1...1.', '..11..11..11..11', '.111.111.111.111'] },
    arp: { oct: 0, pat: '1.5.8.c.8.5.8.5.', bright: 4200, from: 2 },
    pad: { oct: -1, from: 1, seventh: true },
    lead: {
      kind: 'saw', oct: 0,
      A: ['3..3..1.3..5..3.', '4..4..2.4..5..4.', '5..5..3.5..7..5.', 'b---7---5---2---'],
      B: ['a-------6---a---', 'b-----------7---', 'c-----------a---', 'b---7---5---7-b-'],
      C: ['6.6.6.....3.....', '7.7.7.....4.....', 'a.a.a.....5.....', '7.7.7...b...e...'],
    },
    form: 'AABACABA', stab: 'x..x..x..x..x.x.',
  },
};

/** Scale steps (0 = first degree) written by a pattern character, or null for rest / hold. */
export function stepOf(ch: string): number | null {
  if (ch >= '1' && ch <= '9') return ch.charCodeAt(0) - 49;
  if (ch >= 'a' && ch <= 'g') return ch.charCodeAt(0) - 97 + 7;
  if (ch >= 'A' && ch <= 'G') return ch.charCodeAt(0) - 65 - 7;
  return null;
}
/** MIDI note of a scale step (may be negative or above 6). */
export function noteOf(song: Song, step: number, oct = 0): number {
  const n = song.scale.length;
  const o = Math.floor(step / n);
  return song.key + 12 * (o + oct) + song.scale[step - o * n];
}
/** Root (as a scale step) of the chord in a bar. */
export function chordRoot(song: Song, bar: number): number {
  return song.chords.charCodeAt(((bar % song.chords.length) + song.chords.length) % song.chords.length) - 49;
}
/** How many sixteenths the note starting at `s` lasts (it is extended by '-'). */
function lengthAt(pat: string, s: number): number {
  let n = 1;
  while (s + n < pat.length && pat[s + n] === '-') n++;
  return n;
}

export interface StepInfo {
  /** Sixteenth-note index from the start of the song. */
  step: number;
  /** When it sounds, and how long one sixteenth lasts right now. */
  t: number; sd: number;
  /** Arrangement level of this bar and of the next one (1..3). */
  energy: number; next: number;
  /** 0 normal, 1 past halfway, 2 record run. */
  hype: number;
}

const vel = (ch: string): number => (ch === 'X' ? 1 : ch === 'x' ? 0.82 : ch === 'o' ? 0.34 : 0);

/** Play everything that starts on one sixteenth. */
export function playStep(v: Voices, song: Song, i: StepInfo): void {
  const s = ((i.step % 16) + 16) % 16;
  const bar = Math.floor(i.step / 16);
  const { t, sd } = i;
  const e = Math.max(1, Math.min(3, i.energy));
  const kit = song.kit[e - 1];
  const root = chordRoot(song, bar);
  const phraseEnd = bar % 4 === 3;
  const fill = phraseEnd && s >= 12 && i.next >= e && e >= 2;
  const hard = song.drums === 'hard';

  // ---- drums ---------------------------------------------------------------
  if (kit.kick[s] !== '.') v.kick(t, vel(kit.kick[s]), Math.min(0.26, sd * 2.2), hard);
  if (fill) v.snare(t, 0.4 + 0.15 * (s - 12), hard);
  else if (kit.snare[s] !== '.') v.snare(t, vel(kit.snare[s]), hard);
  if (kit.clap[s] !== '.' && !fill) v.clap(t, vel(kit.clap[s]));
  if (kit.open[s] !== '.') v.hat(t, 0.8, true);
  else if (kit.hat[s] !== '.') v.hat(t, vel(kit.hat[s]));
  if (kit.perc[s] !== '.') v.perc(t, 0.7, s % 8 < 4 ? 520 : 390, hard);
  if (i.hype >= 1 && s % 2 === 1) v.hat(t, 0.3);
  if (s === 0 && bar > 0 && bar % 4 === 0) v.crash(t, e >= 2 ? 0.9 : 0.5);
  if (s === 0 && i.next > e) v.riser(t, sd * 16, 0.6 + 0.2 * i.next);

  // ---- bass ----------------------------------------------------------------
  const bp = song.bass.pat[e - 1];
  const bs = stepOf(bp[s]);
  if (bs !== null) {
    const len = lengthAt(bp, s);
    v.bass(noteOf(song, root + bs, song.bass.oct), t, sd * len * 0.92, bp[s] === '1' ? 0.95 : 0.8, song.bass.kind, 1 / (sd * [4, 2, 3, 6][bar % 4]));
  }

  // ---- chords --------------------------------------------------------------
  const triad = [root, root + 2, root + 4];
  if (s === 0 && e >= song.pad.from) {
    const notes = (song.pad.seventh ? [...triad, root + 6] : triad).map((d) => noteOf(song, d, song.pad.oct));
    v.pad(notes, t, sd * 15.5, e === 1 ? 0.75 : 1, 1300 + 500 * e);
  }
  if (e >= 3 && song.stab && song.stab[s] !== '.') v.stab(triad.map((d) => noteOf(song, d, song.pad.oct + 1)), t, sd * 1.6, 0.85);

  // ---- arpeggio ------------------------------------------------------------
  if (e >= song.arp.from) {
    const as = stepOf(song.arp.pat[s]);
    if (as !== null) {
      v.pluck(noteOf(song, root + as, song.arp.oct), t, sd * 0.9, e === 3 ? 1 : 0.8, song.arp.bright + 400 * e, s % 4 < 2 ? -0.3 : 0.3);
      if (i.hype >= 2 && s % 2 === 0) v.pluck(noteOf(song, root + as, song.arp.oct + 1), t, sd * 0.7, 0.45, 5000, s % 4 < 2 ? 0.4 : -0.4);
    }
  }

  // ---- lead ----------------------------------------------------------------
  const part = song.form[Math.floor(bar / 4) % song.form.length];
  const phrase = part === 'A' ? song.lead.A : part === 'B' ? song.lead.B : part === 'C' ? song.lead.C ?? null : null;
  if (phrase) {
    const lp = phrase[bar % 4];
    const ls = stepOf(lp[s]);
    if (ls !== null) {
      const dur = sd * lengthAt(lp, s);
      const loud = e === 1 ? 0.7 : 1;
      v.lead(noteOf(song, ls, song.lead.oct), t, dur, loud, song.lead.kind);
      // last phrase of a track and record runs double the tune an octave up
      if (i.hype >= 2 || (e === 3 && part === 'A' && Math.floor(bar / 4) % 4 === 3)) v.lead(noteOf(song, ls, song.lead.oct + 1), t, dur, 0.4, song.lead.kind === 'bell' ? 'bell' : 'tri');
    }
  }
}
