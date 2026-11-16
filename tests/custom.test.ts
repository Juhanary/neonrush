import { describe, expect, it } from 'vitest';
import { CHECK_STALL, autoBuild } from '../src/core/auto';
import { BAR_ROWS, CFG } from '../src/core/config';
import { blankLevel, flipRanges, musicBars, musicEnergy, musicStart, sanitize, toDef, type TrackMusic } from '../src/core/custom';
import { F, FIGURES, autoFill, isPlainBar } from '../src/core/figures';
import { Level } from '../src/core/level';
import { LEVELS } from '../src/core/levels';
import { lint } from '../src/core/rules';
import { Sim } from '../src/core/sim';
import { Solver, solve } from '../src/core/solve';

const mk = (rows: string[], speed = 28, flips?: [number, number][]) => new Level({ id: 't', name: 'T', world: 0, speed, song: 'cyan', rows, flips });
const plain = (bars: number) => Array<string>(bars * BAR_ROWS).fill(F);

describe('solver', () => {
  it('gives the same answer in slices as in one go', () => {
    const level = new Level(LEVELS[2]);
    const whole = solve(level, 6, 0, Infinity, true);
    const s = new Solver(level, { onBeat: true });
    let slices = 0;
    while (!s.run(500)) slices++;
    expect(slices).toBeGreaterThan(3);
    expect(s.ok).toBe(true);
    expect(s.nodes).toBe(whole.nodes);
    expect(s.jumps).toEqual(whole.jumps);
  });

  it('gives up on a track that cannot be passed without searching everything before it', { timeout: 60_000 }, () => {
    const rows = plain(24);
    for (let r = 20 * BAR_ROWS + 1; r < 20 * BAR_ROWS + 9; r++) rows[r] = '.....'; // an eight-row gap in bar 21
    const s = new Solver(mk(rows), { onBeat: true, stall: CHECK_STALL });
    s.run();
    expect(s.ok).toBe(false);
    expect(Math.floor(s.furthest / CFG.tileL / BAR_ROWS)).toBe(20);
    expect(s.nodes).toBeLessThan(400_000);
  });

  it('the official tracks never come near the no-progress limit of the editor check', () => {
    for (const def of LEVELS) {
      const s = new Solver(new Level(def), { onBeat: true });
      s.run();
      expect(s.maxStall, def.id).toBeLessThan(CHECK_STALL / 2.5);
    }
  });
});

describe('rules', () => {
  it('the official tracks have no rule hints', () => {
    for (const def of LEVELS) expect(lint(new Level(def)), def.id).toEqual([]);
  });

  it('names what is off the beat', () => {
    const rows = plain(4);
    rows[12] = '.....'; rows[13] = '.....';   // gap starts on a beat row
    rows[19] = '==o==';                      // gem one row after the beat
    rows[24] = 'xxxxx';                      // spikes on the first row of a beat
    rows[32] = 'xxxxx'; rows[33] = 'xxxxx'; rows[34] = 'xxxxx'; // three deep, starting on the right row
    rows[0] = '==.==';                       // no floor under the ship at the start
    const codes = lint(mk(rows)).map((i) => `${i.code}@${i.row}`);
    expect(codes).toContain('gapOnBeat@12');
    expect(codes).toContain('offBeat@19');
    expect(codes).toContain('spikeRow@24');
    expect(codes).toContain('spikeDeep@34');
    expect(codes).toContain('start@0');
    expect(codes.filter((c) => c.startsWith('spikeRow')).length).toBe(5);
  });
});

describe('figures', () => {
  it('every editor figure is whole beats and breaks no beat rule on a plain track', () => {
    for (const speed of [22, 25.6, 30, 36]) for (const f of FIGURES) for (const lane of [0, 2, 4]) {
      const made = f.build(lane, speed);
      expect(made.length, f.id).toBe(f.beats * CFG.rowsPerBeat);
      const rows = plain(4);
      rows.splice(BAR_ROWS, made.length, ...made);
      expect(lint(mk(rows, speed)), `${f.id} lane ${lane} at ${speed}`).toEqual([]);
    }
  });

  it('every editor figure can be passed on the beat at the speeds it is meant for', () => {
    for (const speed of [22, 25.6, 30, 36]) for (const f of FIGURES) {
      if (f.id === 'leap' && speed < 28) continue; // says so in its description
      const made = f.build(1, speed);
      const rows = plain(4);
      rows.splice(BAR_ROWS, made.length, ...made);
      const res = solve(mk(rows, speed), 6, 0, Infinity, true);
      expect(res.ok, `${f.id} at ${speed}`).toBe(true);
    }
  });
});

describe('automatic fill', () => {
  it('follows the energy of the music and leaves built bars alone', () => {
    const rows = plain(8);
    rows[2 * BAR_ROWS + 3] = '##=##';
    const mine = rows.slice(2 * BAR_ROWS, 3 * BAR_ROWS);
    const out = autoFill(rows, [1, 1, 3, 3, 3, 1, 3, 3], 30, 5);
    expect(out.length).toBe(rows.length);
    expect(out.slice(2 * BAR_ROWS, 3 * BAR_ROWS)).toEqual(mine);
    const busy = (b: number) => out.slice(b * BAR_ROWS, (b + 1) * BAR_ROWS).filter((r) => /[^=oO]/.test(r)).length;
    expect(busy(0)).toBe(0);
    expect(busy(3) + busy(4)).toBeGreaterThan(busy(1) + busy(5));
    expect(isPlainBar(out.slice(BAR_ROWS, 2 * BAR_ROWS))).toBe(false);
    expect(autoFill(rows, [1, 1, 3, 3, 3, 1, 3, 3], 30, 5)).toEqual(out);
  });

  for (const speed of [19, 23, 25.6, 30, 34.8, 38]) {
    it(`gives a track the rhythm bot and the 100 ms bot finish at ${speed} m/s`, async () => {
      for (const seed of [1, 2, 3]) {
        const bars = 24;
        const energy = Array.from({ length: bars }, (_, b) => 1 + (((b >> 2) + seed) % 3));
        const res = await autoBuild(plain(bars), energy, speed, seed, (rows) => mk(rows, speed));
        expect(res.ok, `seed ${seed} stuck in bar ${res.stuckBar + 1}`).toBe(true);
        expect(lint(mk(res.rows, speed)), `seed ${seed}`).toEqual([]);
        const slow = new Solver(mk(res.rows, speed), { hold: 12, stall: CHECK_STALL });
        slow.run();
        expect(slow.ok, `seed ${seed}: 100 ms bot stuck at row ${Math.floor(slow.furthest / CFG.tileL)}`).toBe(true);
        expect(new Level({ id: 't', name: 'T', world: 0, speed, song: 'cyan', rows: res.rows }).checkpoints.length).toBeGreaterThan(bars / 2);
      }
    }, 120_000);
  }

  it('reports the bar when the trouble is in what the player built', async () => {
    const rows = plain(8);
    for (let r = 4 * BAR_ROWS + 1; r < 4 * BAR_ROWS + 9; r++) rows[r] = '.....';
    const res = await autoBuild(rows, Array(8).fill(2), 28, 3, (r) => mk(r));
    expect(res.ok).toBe(false);
    expect(res.stuckBar).toBe(4);
  }, 60_000);
});

describe('custom tracks', () => {
  const music: TrackMusic = { name: 'song', bpm: 128, t0: 0.25, first: 4, duration: 60, loud: '9'.repeat(40) + '3'.repeat(16) + '9'.repeat(70), hits: '5'.repeat(126) };

  it('take tempo, start and intensity from the music', () => {
    expect(musicStart(music)).toBeCloseTo(0.25 + (4 * 60) / 128, 6);
    expect(musicBars(music)).toBe(30);
    const e = musicEnergy(music, 16);
    expect(e.slice(9, 13)).toEqual([1, 1, 1, 1]);
    expect(e[0]).toBe(3);
    const c = { ...blankLevel('a1', 'MINE', 16), music, speed: music.bpm / 5, flipRows: [...Array.from({ length: 24 }, (_, k) => 48 + k), 110, 111] };
    const def = toDef(c);
    expect(def.id).toBe('custom:a1');
    expect(def.energy).toBe(e.join(''));
    expect(def.flips).toEqual([[48, 72], [110, 112]]);
    const level = new Level(def);
    expect(level.bpm).toBeCloseTo(128, 6);
    expect(level.bars).toBe(16);
    expect(level.energyOf(10)).toBe(1);
  });

  it('flip zones are runs of rows, never over the start', () => {
    expect(flipRanges([], 96)).toEqual([]);
    expect(flipRanges([0, 1, 2, 3, 4, 30, 31, 50], 96)).toEqual([[3, 5], [30, 32], [50, 51]]);
  });

  it('an air block is driven under and kills a ship that jumps into it', () => {
    const rows = Array<string>(4 * BAR_ROWS).fill(F);
    rows[13] = 'nnnnn';
    const drive = new Sim(mk(rows));
    while (drive.s.alive && drive.s.z < 80) drive.step({ steer: 0, jumpPressed: false, jumpHeld: false });
    expect(drive.s.alive, 'driving under').toBe(true);
    const jump = new Sim(mk(rows));
    while (jump.s.alive && jump.s.z < 80) jump.step({ steer: 0, jumpPressed: jump.s.z > 47 && jump.s.grounded, jumpHeld: false });
    expect(jump.s.alive, 'jumping into it').toBe(false);
    expect(Math.floor(jump.s.z / CFG.tileL)).toBeGreaterThanOrEqual(12);
    expect(Math.floor(jump.s.z / CFG.tileL)).toBeLessThanOrEqual(13);
    // and the bots know to stay down
    expect(solve(mk(rows), 6, 0, Infinity, true).ok).toBe(true);
  });

  it('stored data is rebuilt defensively', () => {
    expect(sanitize(null)).toBeNull();
    expect(sanitize({ id: 'x' })).toBeNull();
    const c = sanitize({ id: 'x', name: 'N', rows: ['=====', '==?==', 'short', 7, ...Array(60).fill('.....')], speed: 500, world: -3, flipBars: [1, 99, 'a'], music: { bpm: 'fast' } })!;
    expect(c.rows.length).toBe(5 * BAR_ROWS);
    expect(c.rows.slice(0, 5)).toEqual([F, F, F, F, '.....']);
    expect(c.speed).toBe(38);
    expect(c.world).toBe(0);
    expect(c.flipRows).toEqual(Array.from({ length: 12 }, (_, k) => 12 + k));
    expect(c.music).toBeUndefined();
    expect(() => new Level(toDef(c))).not.toThrow();
    const withMusic = sanitize({ id: 'y', rows: Array(48).fill(F), speed: 24, music })!;
    expect(withMusic.speed).toBeCloseTo(25.6, 6);
  });
});
