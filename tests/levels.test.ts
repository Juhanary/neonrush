import { describe, expect, it } from 'vitest';
import { CFG } from '../src/core/config';
import { Level } from '../src/core/level';
import { LEVELS } from '../src/core/levels';
import { Sim, type ShipState } from '../src/core/sim';

/** Depth-first search over coarse inputs: proves a level can be finished. */
function solve(level: Level): { ok: boolean; nodes: number; furthest: number } {
  const sim = new Sim(level);
  sim.trackGems = false;
  const HOLD = 6; // ticks per decision (50 ms: slower than a human reaction window is fine)
  const actions: [number, boolean][] = [[0, false], [0, true], [-1, false], [1, false], [-1, true], [1, true]];
  const seen = new Set<string>();
  let nodes = 0;
  let furthest = 0;
  const key = (s: ShipState) =>
    `${Math.round(s.z * 2)}|${Math.round(s.x * 4)}|${Math.round(s.y * 4)}|${Math.round(s.vy / 2)}|${Math.round(s.vx / 4)}|${s.boost > 0 ? 1 : 0}`;

  const dfs = (): boolean => {
    if (++nodes > 3_000_000) return false;
    const base = { ...sim.s };
    for (const [steer, jump] of actions) {
      sim.s = { ...base };
      for (let i = 0; i < HOLD && sim.s.alive && !sim.s.finished; i++) {
        sim.step({ steer, jumpPressed: jump && i === 0, jumpHeld: false });
      }
      sim.events.length = 0;
      if (sim.s.finished) return true;
      if (!sim.s.alive) continue;
      furthest = Math.max(furthest, sim.s.z);
      const k = key(sim.s);
      if (seen.has(k)) continue;
      seen.add(k);
      if (dfs()) return true;
    }
    return false;
  };
  return { ok: dfs(), nodes, furthest };
}

describe('levels', () => {
  for (const def of LEVELS) {
    it(`${def.name} is completable`, () => {
      const level = new Level(def);
      const res = solve(level);
      console.log(def.name, 'rows', level.length, 'secs', (level.finishZ / def.speed).toFixed(1), 'gems', level.gemCount, res);
      expect(res.ok, `stuck at row ${Math.floor(res.furthest / CFG.tileL)}`).toBe(true);
    });
  }
});

describe('jump pads', () => {
  for (const def of LEVELS) {
    it(`${def.name}: every pad lands safely with no input, even when entered late`, () => {
      const level = new Level(def);
      let pads = 0;
      def.rows.forEach((row, ri) => {
        [...row].forEach((c, lane) => {
          if (c !== '^') return;
          pads++;
          for (const enter of [0, 0.5, 0.9]) {
            const sim = new Sim(level);
            Object.assign(sim.s, { x: level.laneCenter(lane), z: (ri + enter) * CFG.tileL - 0.2, y: 0, grounded: true });
            let flew = false;
            for (let i = 0; i < 400 && sim.s.alive; i++) {
              sim.step({ steer: 0, jumpPressed: false, jumpHeld: false });
              if (!sim.s.grounded) flew = true;
              else if (flew) break;
            }
            expect(sim.s.alive && sim.s.grounded && flew, `row ${ri} lane ${lane} enter ${enter}`).toBe(true);
          }
        });
      });
      expect(pads).toBeGreaterThan(0);
    });
  }
});

describe('sim', () => {
  const level = new Level(LEVELS[0]);
  const idle = { steer: 0, jumpPressed: false, jumpHeld: false };

  it('doing nothing falls into the first gap', () => {
    const sim = new Sim(level);
    for (let i = 0; i < 2000 && sim.s.alive; i++) sim.step(idle);
    expect(sim.s.alive).toBe(false);
    expect(sim.s.z).toBeGreaterThan(14 * CFG.tileL);
    expect(sim.s.z).toBeLessThan(18 * CFG.tileL);
  });

  it('jump clears at least three tiles and collects gems', () => {
    const sim = new Sim(level);
    for (let i = 0; i < 60; i++) sim.step(idle);
    const z0 = sim.s.z;
    sim.step({ steer: 0, jumpPressed: true, jumpHeld: false });
    expect(sim.s.grounded).toBe(false);
    while (!sim.s.grounded) sim.step(idle);
    expect(sim.s.z - z0).toBeGreaterThan(3 * CFG.tileL);
    for (let i = 0; i < 120; i++) sim.step(idle);
    expect(sim.collected.size).toBeGreaterThan(0);
  });

  it('is deterministic', () => {
    const run = () => {
      const sim = new Sim(level);
      for (let i = 0; i < 500; i++) sim.step({ steer: Math.sin(i * 0.05), jumpPressed: i % 90 === 0, jumpHeld: false });
      return JSON.stringify(sim.s);
    };
    expect(run()).toBe(run());
  });
});
