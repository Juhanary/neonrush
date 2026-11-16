import { CFG } from './config';
import { Level } from './level';

/**
 * The beat rules of docs/LEVELS.md as a check on any track. The official tracks are held to them by
 * tests; the level editor shows them as hints while a track is being built. None of them is a proof:
 * whether a track can be finished is decided by the solver (solve.ts).
 */
export type IssueCode =
  /** A gap starts on a beat row, so the take-off would be before the beat. */
  | 'gapOnBeat'
  /** A pad, a boost, or a gem on the ground or at jump height over floor is not on a beat row. */
  | 'offBeat'
  /** Spikes that do not start on the third row of a beat. */
  | 'spikeRow'
  /** Spikes three rows deep: too long to jump. */
  | 'spikeDeep'
  /** The ship starts on something other than plain floor. */
  | 'start';

export interface Issue { row: number; lane: number; code: IssueCode }

const solid = (s: string): boolean => /[=oO@i|m^>xn]/.test(s);

export function lint(level: Level): Issue[] {
  const out: Issue[] = [];
  const rows = level.rows;
  for (const r of [0, 1]) if (rows[r] && !/[=oO@]/.test(rows[r][2])) { out.push({ row: r, lane: 2, code: 'start' }); break; }
  rows.forEach((row, r) => {
    const beatRow = r % CFG.rowsPerBeat === 0;
    if (!beatRow) { const l = row.search(/[\^>oO]/); if (l >= 0) out.push({ row: r, lane: l, code: 'offBeat' }); }
    if (beatRow && r > 0 && !solid(row) && solid(rows[r - 1])) out.push({ row: r, lane: 2, code: 'gapOnBeat' });
    // inside a flip zone a spiked floor is a different idea (do not touch the floor)
    if (level.inFlip((r + 0.5) * CFG.tileL)) return;
    const prev = r > 0 ? rows[r - 1] : '';
    for (let l = 0; l < row.length; l++) {
      if (row[l] !== 'x') continue;
      if (prev[l] !== 'x') { if (r % CFG.rowsPerBeat !== 2) out.push({ row: r, lane: l, code: 'spikeRow' }); }
      else if (r >= 2 && rows[r - 2][l] === 'x') out.push({ row: r, lane: l, code: 'spikeDeep' });
    }
  });
  return out;
}
