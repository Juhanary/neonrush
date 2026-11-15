import { BAR_ROWS, CFG } from './config';
import type { LevelDef } from './level';

/*
 * TRACKS ARE WRITTEN IN BARS AND BEATS.
 *
 *   1 beat = 3 rows, 1 bar = 4 beats = 12 rows, every track is 16 bars (192 rows).
 *   The first row of every beat is the "beat row": the beat sounds while the ship is in the middle of it.
 *
 * Rules that make a track playable to the music (tests/levels.test.ts enforces them with a bot that may
 * only press jump on the beat):
 *   - a gap or a block to jump starts right after a beat row, so the take-off is on the beat;
 *   - walls with an opening, pads and gems sit on beat rows, so they are passed, hit and heard on the beat;
 *   - an idea lasts a whole number of bars; gravity-flip zones start and end on bar lines;
 *   - a jump lasts longer than a beat, so the beat right after a take-off is never another take-off;
 *   - jump pads land straight ahead with no steering.
 * The helpers below build one beat (three rows) at a time, and `bar` refuses anything that is not 12 rows.
 * See docs/LEVELS.md for the full method.
 * Spikes ('x') kill on contact and cannot be landed on: put a spike row on the third row of a beat
 * (`[F, F, 'xxxxx']`), never more than two rows deep, and jump it on the beat.
 */

type Rows = string[];
const F = '=====', G = '.....';

/** `beats` beats of one and the same row. */
const run = (row = F, beats = 1): Rows => Array<string>(beats * CFG.rowsPerBeat).fill(row);
/** One beat whose beat row is `first` (a wall, a pad, a gem row) followed by `rest`. */
const on = (first: string, rest = F): Rows => [first, rest, rest];
/** Jump on the beat: take off from `from`, then a two-row gap. `air` is the first gap row (for a gem). */
const hop = (from = F, air = G): Rows => [from, air, G];
/** Long jump, two beats: a three-row gap. Needs 28 m/s or more. */
const leap = (from = F, to = F): Rows => [from, G, G, G, to, to];
/** Jump onto a wall of blocks, two beats: take off on the beat, land on top, drive off. */
const mount = (wall = '#####', after = F): Rows => [F, F, wall, wall, wall, after];
/** Jump pad, two beats: launches on the beat, `air` holds gems, lands straight ahead on what follows. */
const pad = (air = '..+..', gapRows = 5): Rows => ['^^^^^', air, air, ...Array<string>(gapRows - 2).fill(G), ...Array<string>(5 - gapRows).fill(F)];
/** Boost pad and the long jump it is for, four beats (a whole bar). */
const boost = (air = '.*.*.'): Rows => ['>>>>>', F, F, F, F, F, F, air, G, G, G, F];
/** Exactly one bar. */
const bar = (...parts: Rows[]): Rows => {
  const rows = parts.flat();
  if (rows.length !== BAR_ROWS) throw new Error(`A bar is ${BAR_ROWS} rows, got ${rows.length}: ${rows.join(' ')}`);
  return rows;
};

/** A hint marker between bars: shown `lead` rows before the row that follows it (negative = later). `hint` is a text key (ui/i18n.ts). */
interface Hint { hint: string; lead: number }
const h = (hint: string, lead = 0): Hint => ({ hint, lead });
/** Markers that open and close a gravity-flip zone at the row that follows. Put them on bar lines. */
interface Flip { flip: 'on' | 'off' }
const FLIP_ON: Flip = { flip: 'on' }, FLIP_OFF: Flip = { flip: 'off' };

function build(items: (Rows | Hint | Flip)[]): Pick<LevelDef, 'rows' | 'hints' | 'flips'> {
  const rows: string[] = [];
  const hints: { row: number; key: string }[] = [];
  const flips: [number, number][] = [];
  let open = -1;
  for (const it of items) {
    if (Array.isArray(it)) rows.push(...it);
    else if ('flip' in it) {
      if (it.flip === 'on') open = rows.length;
      else if (open >= 0) { flips.push([open, rows.length]); open = -1; }
    } else hints.push({ row: rows.length - it.lead, key: it.hint });
  }
  hints.sort((a, b) => a.row - b.row);
  return { rows, hints, flips };
}

/** World 1 — single ideas introduced one at a time, with tutorial callouts. */
const cyanDrift: LevelDef = {
  id: 'cyan-drift', name: 'CYAN DRIFT', world: 0, speed: 24, song: 'cyan',
  ...build([
    h('collect', -4),
    bar(run(), run(), on('==o=='), on('==o==')),
    h('jump', -7),
    bar(on('==o=='), on('==o=='), run(), hop()),
    h('steer', -1),
    bar(run(), on('=o==='), on('===o='), on('=o===')),
    h('dodge', -4),
    bar(on('===o='), run(), [F, F, '==#=='], run()),
    h('lanes', 1),
    bar(run('===..'), run('.===.'), run('..==='), on('..=o=', '..===')),
    h('opening', -3),
    bar(run('.===.'), run(), on('###=='), run()),
    h('sidejump', -6),
    bar(on('==###'), run(), run('==...'), hop('=o...')),
    bar(run('...=='), on('...o=', '...=='), run(), hop()),
    h('gemjump', 1),
    bar(on('=O==='), run(), on('===O='), run()),
    h('pad', 3),
    bar(pad('..+..', 4), run(), run()),
    h('zigzag', 1),
    bar(run('==...'), run('.==..'), run('..==.'), run('...==')),
    bar(on('...o=', '...=='), run('..==.'), run('.==..'), run()),
    h('ontop', 0),
    bar(mount(), on('=o=o='), run()),
    h('boost', 2),
    bar(boost('..*..')),
    h('weave', 1),
    bar(on('=#==='), on('===#='), on('=#==='), run('...==')),
    h('sidejump', 1),
    bar(hop('...=='), run('==...'), on('==o=='), run()),
  ]),
};

/** World 2 — staircases, island hops and a skyway on top of the blocks. */
const solarFlare: LevelDef = {
  id: 'solar-flare', name: 'SOLAR FLARE', world: 1, speed: 26, song: 'solar',
  ...build([
    bar(run(), run(), on('=o=o='), hop()),
    bar(run(), on('==o=='), run(), hop()),
    bar(run('==...'), run('.==..'), on('..o=.', '..==.'), run('...==')),
    bar(hop('...o='), run('.==..'), hop('.o=..'), run('...==')),
    bar(run(), on('###=='), run(), run()),
    bar(on('==###'), run(), run(), on('#==##')),
    bar([F, F, '###..'], run('###..'), run('.###.'), run('..###')),
    bar(['..###', F, F], on('==O=='), run(), hop()),
    bar(run('.=.=.'), on('.o.=.', '.=.=.'), on('.=.o.', '.=.=.'), run()),
    bar(pad('.+.+.', 4), run(), run()),
    bar(run('..=..'), hop('..o..'), run('.=...'), hop('.=...')),
    bar(run('..=..'), hop('..=..'), run('...=.'), on('...o.')),
    bar(boost()),
    bar(run(), run('==...'), hop('=o...'), run('..==.')),
    bar(hop('..==.'), run('==...'), on('=o...'), run()),
    bar(mount(), on('=o=o='), run()),
  ]),
};

/** World 3 — fast slalom, three-lane side jumps, block-top hops and single-lane islands. */
const toxicPulse: LevelDef = {
  id: 'toxic-pulse', name: 'TOXIC PULSE', world: 2, speed: 28, song: 'toxic',
  ...build([
    bar(run(), run(), on('=o=o='), hop()),
    bar(run(), leap(), run()),
    bar(on('###=='), run(), on('==###'), run()),
    bar(on('#==##'), run(), run('==...'), hop('=o...')),
    bar(run('...=='), hop('...=o'), run('==...'), run()),
    bar([F, F, '#####'], run('#####'), ['#####', '#####', G], ['#####', F, F]),
    bar(on('==O=='), run('==...'), run('.==..'), run('..==.')),
    bar(on('...o=', '...=='), run('..==.'), run('.==..'), on('.o=..')),
    bar(boost()),
    bar(pad('..+..'), run(), run()),
    bar(on('###=#'), run(), on('#=###'), run()),
    bar(on('##=##'), run('..=..'), hop('..=..'), run('=....')),
    bar(hop('o....'), run('..=..'), hop('..=..'), run('....=')),
    bar(on('....o'), on('=#=#='), hop(), run()),
    bar(leap(), on('=o=o='), run()),
    bar(mount(), on('==o=='), run()),
  ]),
};

/** World 4 — ice with almost no grip and roads that sway to the music. */
const frostLine: LevelDef = {
  id: 'frost-line', name: 'FROST LINE', world: 3, speed: 29, song: 'frost',
  ...build([
    bar(run(), run(), on('=o=o='), hop()),
    bar(run(), leap(), run()),
    h('ice', 1),
    bar(run('iiiii'), on('ii#ii', 'iiiii'), on('#iii#', 'iiiii'), on('i#i#i', 'iiiii')),
    bar(on('ioioi', 'iiiii'), run('iii..', 2), run('.iii.')),
    bar(run('.iii.'), run('..iii', 2), on('..ioi', '.iii.')),
    bar(run(), hop(), run(), run()),
    h('moving', 1),
    bar(run('.mmm.', 4)),
    bar(run('.mmm.', 2), run(), on('==o==')),
    bar(on('###=='), run(), on('==###'), run()),
    bar(pad('..+..'), run(), run()),
    bar(run('.mm..', 3), run()),
    bar(run('==...'), hop('==...'), run('...=='), on('...o=', '...==')),
    bar(hop('...=='), run('.==..'), mount()),
    bar(run('iiiii'), hop('iiiii'), on('ii#ii', 'iiiii'), run()),
    bar(boost()),
    bar(run('..mm.', 2), on('==O=='), run()),
  ]),
};

/** World 5 — rails to switch between, and a slow-motion stretch where gravity turns upside down. */
const gravityWell: LevelDef = {
  id: 'gravity-well', name: 'GRAVITY WELL', world: 4, speed: 30, song: 'gravity',
  ...build([
    bar(run(), run(), on('=o=o='), hop()),
    h('rail', -5),
    bar(run(), run(), run('=|=|='), run('.|.|.')),
    bar(run('.|.|.', 2), run(), on('=o=o=')),
    h('switch', 1),
    bar(run('.|...'), run('.||..'), run('..|..'), run('..||.')),
    bar(run('...|.'), run(), on('###=='), run()),
    bar(on('==###'), run(), run('==...'), hop('==...')),
    bar(run('...=='), hop('...=='), run('.==..'), run()),
    bar(run('.mm..', 3), run()),
    h('flip', 3),
    FLIP_ON,
    bar(run(), run(), [F, F, '==#=='], run()),
    bar([F, F, '#####'], run(), [F, '..*..', G], run()),
    FLIP_OFF,
    bar(run(), run(), on('=o=o='), run()),
    bar(pad('..+..'), run(), run()),
    bar(run('..mm.', 3), run()),
    bar(run('.|.|.', 2), hop(), run()),
    bar([F, F, '#####'], run('#####'), ['#####', '#####', G], ['#####', F, F]),
    bar(run('iiiii'), on('i#i#i', 'iiiii'), on('==o=='), run()),
  ]),
};

/** World 6 — boost jumps, a skyway with a hop between block tops, and side jumps at speed. */
const emberRush: LevelDef = {
  id: 'ember-rush', name: 'EMBER RUSH', world: 5, speed: 31, song: 'ember',
  ...build([
    bar(run(), run(), on('o=o=o'), hop()),
    bar(run(), leap(), run()),
    bar(run('==...'), run('.==..'), run('..==.'), run('...==')),
    bar(hop('...=o'), run('.==..'), hop('.o=..'), run('...==')),
    bar(run(), on('###=='), run(), on('==###')),
    bar(run(), on('###=='), run(), run()),
    bar(boost()),
    bar([F, F, '###..'], run('###..'), run('.###.'), run('..###')),
    bar(['..###', G, G], run('###..'), run(), on('=O=O=')),
    bar(run('=...='), hop('=...o'), run('..=..'), hop('..o..')),
    bar(run('=...='), on('o...='), run(), run()),
    bar(pad('.+.+.'), run(), run()),
    bar(on('#=###'), run(), on('###=#'), run()),
    bar(on('#=###'), run('..=..'), hop('..=..'), run('=....')),
    bar(hop('=....'), run('..=..'), hop('..=..'), run('....=')),
    bar(on('....='), mount(), run()),
  ]),
};

/** World 7 — roads that sway from edge to edge, rail switching and long ice curves. */
const voltStorm: LevelDef = {
  id: 'volt-storm', name: 'VOLT STORM', world: 6, speed: 32, song: 'volt',
  ...build([
    bar(run(), run(), on('=o=o='), hop()),
    bar(run(), leap(), run()),
    bar(run('.mmm.', 4)),
    bar(run('.mmm.', 2), on('==o=='), run()),
    bar(run('.|...'), run('.||..'), run('..|..'), run('..||.')),
    bar(run('...|.'), run('...||'), run('....|'), run()),
    bar(run('iiiii'), on('ii#ii', 'iiiii'), on('#iii#', 'iiiii'), run()),
    bar(run('==...'), hop('==...'), run('...=='), hop('...=o')),
    bar(run('==...'), on('o=...'), run('mm...', 2)),
    bar(run('mm...', 2), run(), run('...mm')),
    bar(run('...mm', 3), run()),
    bar(on('###=='), run(), on('==###'), run()),
    bar(pad('..+..'), run(), run()),
    bar(run('.iii.'), run('iii..', 2), run('.iii.')),
    bar(run('..iii', 2), run(), run()),
    bar(boost()),
  ]),
};

/** World 8 — the finale: everything so far and two gravity-flip zones, the second one over open space. */
const zeroPoint: LevelDef = {
  id: 'zero-point', name: 'ZERO POINT', world: 7, speed: 33, song: 'zero',
  ...build([
    bar(run(), run(), on('=o=o='), hop()),
    bar(run(), leap(), run()),
    bar(on('###=='), run(), on('==###'), run()),
    bar(run('==...'), hop('==...'), run('...=='), hop('...==')),
    bar(run('==...'), run(), run(), run()),
    FLIP_ON,
    bar(run(), run(), [F, F, '#####'], run()),
    bar([F, '..*..', G], run(), [F, F, '#===#'], [F, F, '#####']),
    FLIP_OFF,
    bar(run(), run(), on('=o=o='), run()),
    bar(run('.|...'), run('.||..'), run('..|..'), run()),
    bar(run('.mmm.', 3), run()),
    bar(run('iiiii'), on('i#i#i', 'iiiii'), on('#i#i#', 'iiiii'), run()),
    bar(pad('..+..'), run(), run()),
    FLIP_ON,
    bar(run(), run(), [F, '.+.+.', G], [G, '.+.+.', G]),
    bar(run(), [F, F, '#####'], run(), run()),
    FLIP_OFF,
    bar(run(), run(), run('..=..'), hop('..=..')),
    bar(run('=....'), hop('=....'), run(), on('==o==')),
  ]),
};

/** World 9 — EXTREME. Built after the concept art: spike rows, crate slaloms, a crate skyway, side jumps at 34 m/s. */
const neonHorizon: LevelDef = {
  id: 'neon-horizon', name: 'NEON HORIZON', world: 8, speed: 34, song: 'horizon', extreme: true,
  energy: '2233 2233 2333 3333',
  ...build([
    h('spikes', 3),
    bar(run(), run(), on('=o=o='), [F, F, 'xxxxx']),
    bar(['xxxxx', F, F], [F, F, 'xx=xx'], on('==o=='), hop()),
    bar(on('###=='), run(), on('==###'), [F, F, 'x===x']),
    bar(run('==...'), hop('=o...'), run('...=='), hop('...o=')),
    bar(run('.==..'), run('..==.'), pad('..+..', 5)),
    bar(run('#####', 2), ['..###', '..###', '...##'], ['...##', '...##', G]),
    bar([G, '..===', '..==='], on('..o==', '..==='), run(), [F, F, 'xxx==']),
    bar(['xxx==', F, F], hop(F, '...*.'), on('===o='), run()),
    bar(boost('.*.*.')),
    FLIP_ON,
    bar(run(), run('xxxxx'), [F, F, '#####'], ['#####', F, F]),
    bar(run(), [F, '..*..', G], run('xxxxx'), run()),
    FLIP_OFF,
    bar(run(), run(), on('=o=o='), hop()),
    bar(run('.|...'), run('.||..'), run('..|..'), run('..||.')),
    bar(run('.mmm.', 3), [F, F, 'xxxxx']),
    bar(['xxxxx', F, F], on('###=='), run(), [F, F, 'xx=xx']),
    bar(['xx=xx', F, F], hop('==o=='), run(), on('o=o=o')),
  ]),
};

export const LEVELS: LevelDef[] = [cyanDrift, solarFlare, toxicPulse, frostLine, gravityWell, emberRush, voltStorm, zeroPoint, neonHorizon];
