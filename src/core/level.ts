import { CFG, ROAD_W } from './config';

/**
 * Level format: one string per row, row 0 is nearest the start, one char per lane.
 *   .  gap            =  floor          #  block (obstacle, can be landed on)
 *   ^  jump pad       >  boost pad      o  floor + gem
 *   O  floor + high gem (needs a jump)  *  gap + gem in the air
 *   +  gap + gem high on a jump-pad arc
 * Plain text so the same data loads unchanged in another engine.
 */
export interface LevelDef {
  id: string;
  name: string;
  world: number;
  speed: number;
  rows: string[];
  /** Tutorial callouts: shown when the ship reaches `row` (may be fractional). */
  hints?: { row: number; key: string }[];
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

  /** Walkable surface height at a point, or null over a gap. */
  heightAt(x: number, z: number): number | null {
    const t = this.tile(this.rowOf(z), this.laneOf(x));
    if (t === '.' || t === '*' || t === '+') return null;
    return t === '#' ? CFG.blockH : 0;
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
