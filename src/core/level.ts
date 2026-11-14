import { CFG, ROAD_W } from './config';

/**
 * Level format: one string per row, row 0 is nearest the start, one char per lane.
 *   .  gap            =  floor          #  block (obstacle, can be landed on)
 *   ^  jump pad       >  boost pad      o  floor + gem
 *   O  floor + high gem (needs a jump)  *  gap + gem in the air
 *   +  gap + gem high on a jump-pad arc
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
  /** Music tempo; visuals pulse on this beat. */
  bpm: number;
  rows: string[];
  /** Tutorial callouts: shown when the ship reaches `row` (may be fractional). */
  hints?: { row: number; key: string }[];
  /** Gravity-flip zones as [fromRow, toRow). */
  flips?: [number, number][];
}

export class Level {
  readonly rows: string[];
  readonly length: number;
  readonly finishZ: number;
  readonly gemCount: number;

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
  }

  private moving: boolean[];

  /** Sideways offset of the moving tiles in a row at a given simulation time. */
  shift(row: number, time: number): number {
    return CFG.moveAmp * Math.sin(time * CFG.moveW - row * CFG.moveK);
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

  /** Walkable surface height at a point, or null over a gap. `time` only matters for moving tiles. */
  heightAt(x: number, z: number, time = 0): number | null {
    const row = this.rowOf(z);
    const lane = this.laneOf(x);
    const t = this.tile(row, lane);
    if (t === '#') return CFG.blockH;
    if (t === '|') return Math.abs(x - this.laneCenter(lane)) <= CFG.railHalf ? 0 : null;
    if (t !== '.' && t !== '*' && t !== '+' && t !== 'm') return 0;
    if (row >= 0 && row < this.length && this.moving[row]) {
      if (this.tile(row, this.laneOf(x - this.shift(row, time))) === 'm') return 0;
    }
    return null;
  }
}

export function isGem(t: string): boolean {
  return t === 'o' || t === 'O' || t === '*' || t === '+';
}
export function gemHeight(t: string): number {
  return t === 'o' ? 0.9 : t === '+' ? 6 : 2.3;
}
/** Vertical pickup tolerance: pad-arc gems are forgiving because the arc varies with speed. */
export function gemReach(t: string): number {
  return t === '+' ? 2.2 : 1.15;
}
