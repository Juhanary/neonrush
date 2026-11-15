import { BAR_ROWS, CFG } from './config';
import { autoFill, isPlainBar, type Rows } from './figures';
import { Level } from './level';
import { Solver } from './solve';

/** Positions without progress after which a check calls a track stuck: three times what any official track needs. */
export const CHECK_STALL = 30_000;

export interface AutoResult {
  rows: Rows;
  /** The rhythm bot finishes the result. */
  ok: boolean;
  /** Bar (0-based) where the bot got stuck when not ok. */
  stuckBar: number;
}

/**
 * Automatic fill with proof: fill the plain bars to the music (figures.ts `autoFill`), let the rhythm bot
 * play the result, and where it gets stuck make the filled bars around that spot calm and try again.
 * Bars the player built are never touched, so if the bot is stuck inside those the result is `ok: false`.
 *
 * `level` builds the Level for a set of rows (the caller knows speed, flip zones and so on).
 * `breathe` is awaited between slices of the search so a page can stay responsive.
 */
export async function autoBuild(
  rows: Rows, energy: number[], speed: number, seed: number,
  level: (rows: Rows) => Level, breathe: () => Promise<void> = async () => {}, slice = 6000,
): Promise<AutoResult> {
  const bars = Math.floor(rows.length / BAR_ROWS);
  const mine = Array.from({ length: bars }, (_, b) => isPlainBar(rows.slice(b * BAR_ROWS, (b + 1) * BAR_ROWS)));
  const calm = new Set<number>();
  let out = rows, stuckBar = -1;
  for (let attempt = 0; attempt < 24; attempt++) {
    out = autoFill(rows, energy, speed, seed, calm);
    const s = new Solver(level(out), { onBeat: true, stall: CHECK_STALL });
    while (!s.run(slice)) await breathe();
    if (s.ok) return { rows: out, ok: true, stuckBar: -1 };
    stuckBar = Math.min(bars - 1, Math.floor(s.furthest / CFG.tileL / BAR_ROWS));
    // calm the nearest filled bars at or before the spot; when they already are, the trouble is in the player's own bars
    let changed = false;
    for (const b of [stuckBar, stuckBar - 1, stuckBar + 1]) {
      if (b >= 0 && b < bars && mine[b] && !calm.has(b)) { calm.add(b); changed = true; if (b !== stuckBar) break; }
    }
    if (!changed) break;
  }
  return { rows: out, ok: false, stuckBar };
}
