import { BAR_ROWS, CFG } from './config';

/*
 * FIGURES: the building blocks of a track, one beat (three rows) at a time.
 *
 * The official tracks (levels.ts), the stamps of the level editor and the automatic fill all build from
 * the same helpers, so a figure placed by hand in the editor follows the same beat rules as a shipped track.
 * See docs/LEVELS.md for the rules and docs/EDITOR.md for the editor.
 */

export type Rows = string[];
export const F = '=====', G = '.....';

/** `beats` beats of one and the same row. */
export const run = (row = F, beats = 1): Rows => Array<string>(beats * CFG.rowsPerBeat).fill(row);
/** One beat whose beat row is `first` (a wall, a pad, a gem row) followed by `rest`. */
export const on = (first: string, rest = F): Rows => [first, rest, rest];
/** Jump on the beat: take off from `from`, then a two-row gap. `air` is the first gap row (for a gem in the air). */
export const hop = (from = F, air = G): Rows => [from, air, G];
/** Long jump, two beats: a three-row gap. Needs 28 m/s or more. */
export const leap = (from = F, to = F): Rows => [from, G, G, G, to, to];
/** Jump onto a wall of blocks, two beats: take off on the beat, land on top, drive off. */
export const mount = (wall = '#####', after = F): Rows => [F, F, wall, wall, wall, after];
/** Jump pad, two beats: launches on the beat, `air` holds gems, lands straight ahead on what follows. */
export const pad = (air = '..+..', gapRows = 5): Rows => ['^^^^^', air, air, ...Array<string>(gapRows - 2).fill(G), ...Array<string>(5 - gapRows).fill(F)];
/** Boost pad and the long jump it is for, four beats (a whole bar). */
export const boost = (air = '..*..'): Rows => ['>>>>>', F, F, F, F, F, F, air, G, G, G, F];
/** Exactly one bar. */
export const bar = (...parts: Rows[]): Rows => {
  const rows = parts.flat();
  if (rows.length !== BAR_ROWS) throw new Error(`A bar is ${BAR_ROWS} rows, got ${rows.length}: ${rows.join(' ')}`);
  return rows;
};

/** Left and right swapped. */
export const mirror = (rows: Rows): Rows => rows.map((r) => [...r].reverse().join(''));
/** Gap rows a jump pad needs at this speed (rule 6 in docs/LEVELS.md). */
export const padGap = (speed: number): number => (speed < 27 ? 4 : 5);
const put = (row: string, lane: number, c: string): string => row.slice(0, lane) + c + row.slice(lane + 1);

/**
 * Editor stamps. A stamp covers whole beats and is placed on a beat, so its take-offs, pads and gems land
 * where the rules want them. `lane` is the lane that was tapped: one-sided figures face that side.
 */
export interface Figure { id: string; beats: number; build(lane: number, speed: number): Rows }

const sided = (lane: number, rows: Rows): Rows => (lane > 2 ? mirror(rows) : rows);

export const FIGURES: Figure[] = [
  { id: 'floor', beats: 1, build: () => run() },
  { id: 'gems', beats: 1, build: (l) => on(put(F, l, 'o')) },
  { id: 'hop', beats: 1, build: () => hop() },
  { id: 'block', beats: 1, build: (l) => [F, F, put(F, l, '#')] },
  { id: 'wall', beats: 1, build: (l) => on(l < 2 ? '==###' : l > 2 ? '###==' : '#===#') },
  { id: 'spikes', beats: 1, build: () => [F, F, 'xxxxx'] },
  { id: 'spikeGate', beats: 1, build: (l) => [F, F, put('xxxxx', l, '=')] },
  { id: 'pad', beats: 2, build: (_l, s) => pad('..+..', padGap(s)) },
  { id: 'leap', beats: 2, build: () => leap() },
  { id: 'mount', beats: 2, build: () => mount() },
  { id: 'side', beats: 3, build: (l) => sided(l, [...run('==...'), ...hop('=o...'), ...run('...==')]) },
  { id: 'stairs', beats: 4, build: (l) => sided(l, [...run('==...'), ...run('.==..'), ...run('..==.'), ...run('...==')]) },
  { id: 'skyway', beats: 4, build: (l) => sided(l, [F, F, '###..', ...run('###..'), ...run('.###.'), ...run('..###')]) },
  { id: 'boost', beats: 4, build: () => boost() },
  { id: 'rails', beats: 2, build: () => run('.|.|.', 2) },
  { id: 'ice', beats: 2, build: () => [...run('iiiii'), ...on('i#i#i', 'iiiii')] },
  { id: 'moving', beats: 2, build: () => run('.mmm.', 2) },
];

/**
 * Whole bars for the automatic fill, by intensity 1..3. Every bar starts with a beat of full floor, so any
 * two of them can follow each other: a jump from the last beat of one lands on the first beat of the next.
 * `ground` marks the bars that must be entered on the ground; they never follow a bar that ends in the `air`.
 */
interface AutoBar { tier: 1 | 2 | 3; rows(speed: number): Rows; min?: number; max?: number; air?: boolean; ground?: boolean; flat?: boolean }

const AUTO: AutoBar[] = [
  { tier: 1, flat: true, rows: () => bar(run(), on('==o=='), run(), on('==o==')) },
  { tier: 1, rows: () => bar(run(), on('==o=='), run(), hop()), air: true },
  { tier: 1, rows: () => bar(run(), on('=o==='), on('===o='), on('=o===')) },
  { tier: 1, rows: () => bar(run(), [F, F, '==#=='], run(), on('==o==')) },
  { tier: 1, rows: () => bar(run(), run('.===.', 2), on('==o==')) },
  { tier: 1, rows: () => bar(run(), hop(), run(), on('=o===')) },

  { tier: 2, rows: () => bar(run(), hop(), run(), hop()), air: true },
  { tier: 2, rows: () => bar(run(), on('###=='), run(), on('==###')) },
  { tier: 2, rows: () => bar(run(), run('===..'), run('.===.'), on('..=o=', '..===')) },
  { tier: 2, rows: () => bar(run(), [F, F, 'xxxxx'], run(), on('==o==')) },
  { tier: 2, rows: (s) => bar(run(), pad('..+..', padGap(s)), run()) },
  { tier: 2, min: 21, rows: () => bar(run(), run('==...'), hop('=o...'), run('...==')) },
  { tier: 2, rows: () => bar(run(), on('=O==='), run(), on('===O=')) },
  { tier: 2, rows: () => bar(run(), run('.|.|.', 2), on('==o==')) },
  { tier: 2, rows: () => bar(run(), [F, F, 'xx=xx'], on('==o=='), hop()), air: true },

  { tier: 3, rows: () => bar(run(), mount(), on('==o==')) },
  { tier: 3, min: 24, rows: () => bar(run(), [F, F, 'xxxxx'], ['xxxxx', F, F], hop()), air: true },
  { tier: 3, min: 28, rows: () => bar(run(), leap(), on('==o==')) },
  { tier: 3, rows: () => bar(run(), on('##=##'), run('..=..'), hop('..=..')), air: true },
  { tier: 3, rows: () => bar(run(), hop(F, '..*..'), run(), [F, F, 'xxxxx']), air: true },
  { tier: 3, rows: () => bar(run(), on('###=='), on('==o=='), [F, F, 'xx=xx']), air: true },
  { tier: 3, min: 22, max: 36, ground: true, rows: () => bar(boost()) },
  { tier: 3, min: 21, rows: () => bar(run(), run('==...'), hop('=o...'), on('...o=', '...==')) },
  { tier: 3, rows: () => bar(run('iiiii'), on('ii#ii', 'iiiii'), on('#iii#', 'iiiii'), run()) },
];

/** Small deterministic generator, so a seed always gives the same track (and tests can pin one). */
export function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const isPlainBar = (rows: Rows): boolean => rows.every((r) => r === F);
const endsInAir = (rows: Rows): boolean => rows.slice(-2).some((r) => /[.*+]/.test(r)) || rows.slice(-1).some((r) => r.includes('x'));
const calmStart = (rows: Rows): boolean => rows.slice(0, 2).every((r) => r === F || /^[=oO@]+$/.test(r));

/**
 * Fill the plain bars of a track with figures that match the music: `energy[b]` (1..3) picks how busy
 * bar b gets. Bars that already hold something are left alone. Bar 1 and the last bar stay gentle.
 * `calm` lists bars to keep at intensity 1 with nothing to jump (used to back off where a bot got stuck).
 * The result still has to be checked with the solver: the figures are fair one by one, not in every order.
 */
export function autoFill(rows: Rows, energy: number[], speed: number, seed: number, calm: ReadonlySet<number> = new Set()): Rows {
  const bars = Math.floor(rows.length / BAR_ROWS);
  const out = rows.slice();
  const rnd = rng(seed);
  const get = (b: number): Rows => out.slice(b * BAR_ROWS, (b + 1) * BAR_ROWS);
  const fill = rows.length ? Array.from({ length: bars }, (_, b) => isPlainBar(get(b))) : [];
  let last = -1;
  for (let b = 0; b < bars; b++) {
    if (!fill[b]) continue;
    const prevAir = b > 0 && endsInAir(get(b - 1));
    // the bar after this one, when the player built it, has to be reachable from this one
    const nextNeedsGround = b + 1 < bars && !fill[b + 1] && !calmStart(get(b + 1));
    let tier = Math.max(1, Math.min(3, Math.round(energy[b] ?? 2)));
    if (b === 0 || b === bars - 1) tier = 1;
    let pool = AUTO.map((a, i) => ({ a, i })).filter(({ a, i }) =>
      a.tier === tier && i !== last && speed >= (a.min ?? 0) && speed <= (a.max ?? 99) && !(a.ground && prevAir) && !(a.air && (nextNeedsGround || b === bars - 1)));
    if (calm.has(b) || b === 0) pool = AUTO.map((a, i) => ({ a, i })).filter(({ a }) => a.flat);
    if (!pool.length) pool = AUTO.map((a, i) => ({ a, i })).filter(({ a }) => a.flat);
    const pick = pool[Math.floor(rnd() * pool.length)];
    last = pick.i;
    let made = pick.a.rows(speed);
    if (rnd() < 0.5) made = mirror(made);
    out.splice(b * BAR_ROWS, BAR_ROWS, ...made);
  }
  return out;
}
