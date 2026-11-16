/**
 * Level report: `npm run level:report` (all tracks) or `npm run level:report -- cyan-drift`.
 * Prints each track bar by bar on the beat grid, with the music intensity of every bar, where the
 * rhythm bot jumps, checkpoints, flip zones and rule warnings. Skipped during a normal `npm test`.
 */
import { it } from 'vitest';
import { BAR_ROWS, CFG } from '../src/core/config';
import { Level, isGem } from '../src/core/level';
import { LEVELS } from '../src/core/levels';
import { solve } from './bot';

// declared here so the project does not need Node's type package
declare const process: { env: Record<string, string | undefined>; stdout: { write(s: string): void } };

const only = process.env.LEVEL;
const out = (s: string) => process.stdout.write(s + '\n');

it.skipIf(!process.env.REPORT)('level report', () => {
  for (const def of LEVELS) {
    if (only && def.id !== only) continue;
    const level = new Level(def);
    const beat = solve(level, 6, 0, Infinity, true);
    const fast = solve(level, 6), slow = solve(level, 12);
    const cps = new Set(level.checkpoints.map((c) => c.row));
    out(`\n=== ${def.name} (${def.id})  ${def.speed} m/s  ${level.bpm} BPM  song "${def.song}"  ${level.bars} bars  ${(level.finishZ / def.speed).toFixed(1)} s  ${level.gemCount} gems  ${level.checkpoints.length - 1} checkpoints`);
    out(`    bots: rhythm ${beat.ok ? 'ok' : 'FAIL'}, 50 ms ${fast.ok ? 'ok' : 'FAIL'}, 100 ms ${slow.ok ? 'ok' : 'FAIL'}`);
    out('    bar  e  jumps  beat 1             beat 2             beat 3             beat 4');
    const warn: string[] = [];
    for (let b = 0; b < level.bars; b++) {
      const cells: string[] = [];
      for (let k = 0; k < CFG.beatsPerBar; k++) cells.push(level.rows.slice(b * BAR_ROWS + k * 3, b * BAR_ROWS + k * 3 + 3).join(' '));
      // which beats of this bar the rhythm bot pressed jump on
      const mark = Array(CFG.beatsPerBar).fill('.');
      for (const j of beat.jumps) { const n = Math.round(j); if (Math.floor(n / CFG.beatsPerBar) === b) mark[n % CFG.beatsPerBar] = 'J'; }
      const flip = level.inFlip((b * BAR_ROWS + 1) * CFG.tileL) ? ' FLIP' : '';
      let cp = '';
      for (let r = b * BAR_ROWS; r < (b + 1) * BAR_ROWS; r++) if (cps.has(r) && r > 0) cp += ` cp@${r}`;
      out(`    ${String(b + 1).padStart(3)}  ${level.energyOf(b)}  ${mark.join('')}   ${cells.join(' | ')}${flip}${cp}`);
    }
    level.rows.forEach((row, r) => {
      const where = `bar ${Math.floor(r / BAR_ROWS) + 1} beat ${Math.floor((r % BAR_ROWS) / 3) + 1} row ${r}`;
      const beatRow = r % CFG.rowsPerBeat === 0;
      if (/[\^>oO]/.test(row) && !beatRow) warn.push(`${where}: pad or gem off the beat row "${row}"`);
      if (!beatRow && [...row].some(isGem) && r % 3 === 1 && !/[*+@]/.test(row)) warn.push(`${where}: gem one row after the beat`);
      // a gap or wall that starts on a beat row forces an early take-off
      const solid = (s: string) => /[=oO@i|m^>xn]/.test(s);
      if (beatRow && r > 0 && !solid(row) && solid(level.rows[r - 1])) warn.push(`${where}: gap starts ON the beat row; start it one row later so the take-off is on the beat`);
      const prev = r > 0 ? level.rows[r - 1] : '';
      // inside a flip zone a spiked floor is a different idea (do not touch the floor), so these rules do not apply
      const inFlip = level.inFlip((r + 0.5) * CFG.tileL);
      [...row].forEach((c, l) => {
        if (inFlip || c !== 'x' || prev[l] === 'x') return;
        if (r % 3 !== 2) warn.push(`${where}: spike in lane ${l} starts on row ${r % 3 + 1} of the beat; put it on the third row`);
      });
      if (!inFlip && r >= 2 && [...row].some((c, l) => c === 'x' && prev[l] === 'x' && level.rows[r - 2][l] === 'x')) warn.push(`${where}: spikes three rows deep cannot be cleared`);
    });
    for (const [a, b] of def.flips ?? []) if (a % BAR_ROWS || b % BAR_ROWS) warn.push(`flip zone ${a}-${b} is not on bar lines`);
    if (level.length !== 16 * BAR_ROWS) warn.push(`length is ${level.length} rows, expected ${16 * BAR_ROWS}`);
    out(warn.length ? warn.map((w) => '    WARNING ' + w).join('\n') : '    no rule warnings');
  }
});
