import { BAR_ROWS, BEAT_LEN, CFG, ROAD_W } from './config';

/**
 * Level format: one string per row, row 0 is nearest the start, one char per lane.
 *   .  gap            =  floor          #  block (obstacle, can be landed on)
 *   ^  jump pad       >  boost pad
 *   o  floor + gem on the ground        O  floor + gem at jump height     @  floor + gem high up
 *                                       *  gap + gem at jump height       +  gap + gem high up
 *      There is one kind of gem, at three heights: on the ground (driven through), at jump height
 *      (needs a jump) and high up (needs a jump from the top of a block, a jump pad or a flip zone).
 *      A row holds at most one gem, so every gem of a track can be collected in one run.
 *   m  moving road: slides sideways in a travelling wave
 *   i  ice: steering has very little grip
 *   |  rail: a narrow beam in the middle of the lane
 * Plain text so the same data loads unchanged in another engine.
 */
export interface LevelDef {
  id: string;
  name: string;
  world: number;
  speed: number;
  /** Shown as EXTREME in the menu. */
  extreme?: boolean;
  /** Name of the song (audio/songs.ts). The tempo is not stored: it follows from the speed (Level.bpm). */
  song: string;
  rows: string[];
  /**
   * Optional music intensity per bar, one digit 0..3 each (spaces ignored). Bars left out, or the whole
   * string, fall back to the intensity derived from how busy the bar is.
   */
  energy?: string;
  /** Tutorial callouts: shown when the ship reaches `row` (may be fractional). */
  hints?: { row: number; key: string }[];
  /** Gravity-flip zones as [fromRow, toRow). */
  flips?: [number, number][];
}

export interface Checkpoint { row: number; x: number; z: number }

export class Level {
  readonly rows: string[];
  readonly length: number;
  readonly finishZ: number;
  readonly gemCount: number;
  /** Practice-mode respawn points, in track order. The first one is the start line. */
  readonly checkpoints: Checkpoint[];

  constructor(readonly def: LevelDef) {
    for (const r of def.rows) {
      if (r.length !== CFG.lanes) throw new Error(`Bad row "${r}" in ${def.id}`);
    }
    this.rows = def.rows;
    this.length = def.rows.length;
    this.finishZ = this.length * CFG.tileL;
    let g = 0;
    for (const r of def.rows) for (const c of r) if (isGem(c)) g++;
    this.gemCount = g;
    this.moving = def.rows.map((r) => r.includes('m'));
    this.checkpoints = this.findCheckpoints();
  }

  /**
   * A checkpoint needs two rows of floor (ice and rails count) in one lane and no block or spike right after them.
   * The lane nearest the middle wins, so the result depends only on the level data.
   */
  private findCheckpoints(): Checkpoint[] {
    const out: Checkpoint[] = [{ row: 0, x: 0, z: 2 }];
    const plain = (row: number, lane: number) => { const t = this.tile(row, lane); return t === '=' || t === 'o' || t === 'O' || t === '@' || t === 'i' || t === '|'; };
    let last = 0, boost = -99;
    for (let row = 1; row < this.length - 4; row++) {
      if (this.rows[row - 1].includes('>')) boost = row - 1;
      // never between a boost pad and the long jump it is there for
      if (row - last < CFG.checkpointGap || row - boost < 12) continue;
      for (const lane of [2, 1, 3, 0, 4]) {
        if (plain(row, lane) && plain(row + 1, lane) && this.tile(row + 2, lane) !== '#' && this.tile(row + 2, lane) !== 'x') {
          out.push({ row, x: this.laneCenter(lane), z: row * CFG.tileL + 1 });
          last = row;
          break;
        }
      }
    }
    return out;
  }

  /** Index of the last checkpoint at or before `z`. */
  checkpointAt(z: number): number {
    let i = 0;
    while (i + 1 < this.checkpoints.length && this.checkpoints[i + 1].z <= z) i++;
    return i;
  }

  private moving: boolean[];

  /** Tempo that keeps one beat = rowsPerBeat rows at this track's speed. */
  get bpm(): number { return (this.def.speed * 60) / BEAT_LEN; }
  /** Number of bars (rows are authored in whole bars). */
  get bars(): number { return Math.ceil(this.length / BAR_ROWS); }
  /** Beat position of a ship whose centre is at z. Fractional; beat 0 is the spawn point. */
  beatAt(z: number): number { return (z - CFG.beatZ0) / BEAT_LEN; }
  /** Upward pull inside a flip zone: chosen so that tapping once per (half-tempo) beat holds altitude. */
  get flipGravity(): number { return (2 * CFG.flipThrust * this.def.speed * CFG.flipSpeed) / BEAT_LEN; }

  /**
   * Music intensity of a bar, 0 (intro / breather) .. 3 (everything). Derived from how much of the bar
   * is not plain full-width floor, unless LevelDef.energy overrides it. Presentation only.
   */
  energyOf(bar: number): number {
    const b = Math.max(0, Math.min(this.bars - 1, bar));
    const o = this.def.energy?.replace(/\s/g, '')[b];
    if (o !== undefined && o >= '0' && o <= '3') return +o;
    if (b === 0) return 1;
    let busy = 0;
    for (let r = b * BAR_ROWS; r < (b + 1) * BAR_ROWS && r < this.length; r++) if (/[^=oO@]/.test(this.rows[r])) busy++;
    return busy <= 2 ? 1 : busy <= 7 ? 2 : 3;
  }

  /** Sideways offset of the moving tiles in a row when the ship is at beat position `beat`. */
  shift(row: number, beat: number): number {
    return CFG.moveAmp * Math.sin(beat * CFG.moveBeat - row * CFG.moveK);
  }

  inFlip(z: number): boolean {
    const f = this.def.flips;
    if (!f) return false;
    const row = z / CFG.tileL;
    for (const [a, b] of f) if (row >= a && row < b) return true;
    return false;
  }

  laneOf(x: number): number {
    return Math.floor((x + ROAD_W / 2) / CFG.tileW);
  }
  rowOf(z: number): number {
    return Math.floor(z / CFG.tileL);
  }
  laneCenter(lane: number): number {
    return -ROAD_W / 2 + (lane + 0.5) * CFG.tileW;
  }

  tile(row: number, lane: number): string {
    if (lane < 0 || lane >= CFG.lanes || row < 0) return '.';
    if (row >= this.length) return row < this.length + CFG.runway ? '=' : '.';
    return this.rows[row][lane];
  }

  /**
   * Walkable surface height at a point, or null over a gap. Spikes ('x') stand on floor (height 0) and are
   * lethal in Sim. An air block ('n') has two surfaces: the road under it and its own top. `y` is the height
   * of the ship that asks: at or above the top (within the step tolerance) it gets the top, below it the road,
   * where Sim destroys a ship that touches the block (`reach` widens the top for the ledge assist). `beat` (the ship's beat position) only matters for moving tiles.
   */
  heightAt(x: number, z: number, beat = 0, y = 0, reach: number = CFG.stepTol): number | null {
    const row = this.rowOf(z);
    const lane = this.laneOf(x);
    const t = this.tile(row, lane);
    if (t === '#') return CFG.blockH;
    if (t === 'n') return y >= CFG.airHi - reach ? CFG.airHi : 0;
    if (t === '|') return Math.abs(x - this.laneCenter(lane)) <= CFG.railHalf ? 0 : null;
    if (t !== '.' && t !== '*' && t !== '+' && t !== 'm') return 0;
    if (row >= 0 && row < this.length && this.moving[row]) {
      if (this.tile(row, this.laneOf(x - this.shift(row, beat))) === 'm') return 0;
    }
    return null;
  }
}

/** The three heights a gem can hang at. */
export const GEM_LOW = 0, GEM_MID = 1, GEM_HIGH = 2;
export type GemLevel = 0 | 1 | 2;

/** Height step of a gem tile, or -1 when the tile holds no gem. */
export function gemLevel(t: string): GemLevel | -1 {
  return t === 'o' ? GEM_LOW : t === 'O' || t === '*' ? GEM_MID : t === '@' || t === '+' ? GEM_HIGH : -1;
}
export function isGem(t: string): boolean {
  return gemLevel(t) >= 0;
}
/** Centre of the gem above the road. */
export function gemHeight(t: string): number {
  const g = gemLevel(t);
  return g === GEM_LOW ? 0.9 : g === GEM_HIGH ? 6 : 2.3;
}
/**
 * Vertical pickup tolerance. High gems are forgiving because the arcs that reach them (a jump off a block,
 * a jump pad) vary with speed; the lowest point that still collects one (3.3 m) is out of reach of a jump
 * from the road (2.5 m).
 */
export function gemReach(t: string): number {
  return gemLevel(t) === GEM_HIGH ? 2.2 : 1.15;
}
/** What is left of a tile when its gem is taken away: floor or gap. */
export function gemGround(t: string): string {
  return t === '*' || t === '+' ? '.' : isGem(t) ? '=' : t;
}
/**
 * The tile for a gem at height `g` put on tile `under`: a gap stays a gap under a gem in the air, anything
 * else becomes floor. A gem on the ground always has floor under it.
 */
export function gemTile(g: GemLevel, under: string): string {
  const gap = under === '.' || under === '*' || under === '+';
  return g === GEM_LOW ? 'o' : g === GEM_MID ? (gap ? '*' : 'O') : gap ? '+' : '@';
}
/** Lanes of the gems in a row. */
export function gemLanes(row: string): number[] {
  const out: number[] = [];
  for (let l = 0; l < row.length; l++) if (isGem(row[l])) out.push(l);
  return out;
}
/**
 * Keep one gem in every row: of several, the one nearest the gem before it (the middle lane at first)
 * stays and the others turn back into floor or gap. Tracks stored before the rule existed go through this.
 */
export function oneGemPerRow(rows: string[]): string[] {
  let last = 2;
  return rows.map((row) => {
    const lanes = gemLanes(row);
    if (!lanes.length) return row;
    let keep = lanes[0];
    for (const l of lanes) if (Math.abs(l - last) < Math.abs(keep - last)) keep = l;
    last = keep;
    return lanes.length === 1 ? row : [...row].map((t, l) => (l !== keep && isGem(t) ? gemGround(t) : t)).join('');
  });
}
