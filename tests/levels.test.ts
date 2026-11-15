import { describe, expect, it } from 'vitest';
import { BAR_ROWS, CFG } from '../src/core/config';
import { Level } from '../src/core/level';
import { LEVELS } from '../src/core/levels';
import { Sim } from '../src/core/sim';
import { solve } from './bot';

describe('levels', () => {
  for (const def of LEVELS) {
    it(`${def.name} is completable`, () => {
      const level = new Level(def);
      const res = solve(level);
      console.info(def.name, 'rows', level.length, 'secs', (level.finishZ / def.speed).toFixed(1), 'gems', level.gemCount, res);
      expect(res.ok, `stuck at row ${Math.floor(res.furthest / CFG.tileL)}`).toBe(true);
    });
  }
});

describe('rhythm', () => {
  for (const def of LEVELS) {
    const level = new Level(def);
    it(`${def.name} is 16 whole bars and its flip zones sit on bar lines`, () => {
      expect(level.length).toBe(16 * BAR_ROWS);
      for (const [a, b] of def.flips ?? []) { expect(a % BAR_ROWS).toBe(0); expect(b % BAR_ROWS).toBe(0); }
    });
    it(`${def.name} can be finished pressing jump only on the beat`, () => {
      const res = solve(level, 6, 0, Infinity, true);
      expect(res.ok, `stuck at row ${Math.floor(res.furthest / CFG.tileL)} (bar ${Math.floor(res.furthest / CFG.tileL / BAR_ROWS) + 1})`).toBe(true);
    });
    it(`${def.name}: spikes start on the third row of a beat and are at most two rows deep`, () => {
      def.rows.forEach((row, r) => [...row].forEach((c, l) => {
        if (c !== 'x' || level.inFlip((r + 0.5) * CFG.tileL)) return; // a spiked floor in a flip zone is fine
        const prev = r > 0 ? def.rows[r - 1][l] : '.';
        if (prev !== 'x') expect(r % CFG.rowsPerBeat, `row ${r} lane ${l}`).toBe(2);
        else expect(r >= 2 && def.rows[r - 2][l] === 'x', `row ${r} lane ${l}: three deep`).toBe(false);
      }));
    });
    it(`${def.name}: gems, pads and boosts are on beat rows (gems in the air may follow the beat row)`, () => {
      def.rows.forEach((row, r) => {
        const beatRow = r % CFG.rowsPerBeat === 0;
        if (/[\^>oO]/.test(row)) expect(beatRow, `row ${r} "${row}" (bar ${Math.floor(r / BAR_ROWS) + 1})`).toBe(true);
      });
    });
  }
});

describe('levels at a human pace', () => {
  for (const def of LEVELS) {
    it(`${def.name} can be finished with one decision every 100 ms`, () => {
      const level = new Level(def);
      const res = solve(level, 12);
      expect(res.ok, `stuck at row ${Math.floor(res.furthest / CFG.tileL)}`).toBe(true);
    });
  }
});

describe('practice checkpoints', () => {
  for (const def of LEVELS) {
    it(`${def.name}: every checkpoint is a fair place to restart from`, () => {
      const level = new Level(def);
      const cps = level.checkpoints;
      console.info(def.name, 'checkpoints at rows', cps.map((c) => c.row).join(' '));
      expect(cps.length).toBeGreaterThan(8);
      for (let i = 1; i < cps.length; i++) expect(cps[i].row - cps[i - 1].row, `gap after row ${cps[i - 1].row}`).toBeLessThan(34);
      for (let i = 1; i < cps.length; i++) {
        // doing nothing must not lose the ship straight away
        const sim = new Sim(level);
        sim.spawnAt(cps[i]);
        for (let t = 0; t < 24; t++) sim.step({ steer: 0, jumpPressed: false, jumpHeld: false });
        expect(sim.s.alive, `row ${cps[i].row} dies at once`).toBe(true);
        // and the bot gets from here past the checkpoint after next
        const goal = i + 2 < cps.length ? cps[i + 2].z + 4 : Infinity;
        const res = solve(level, 6, i, goal);
        expect(res.ok, `from row ${cps[i].row} stuck at row ${Math.floor(res.furthest / CFG.tileL)}`).toBe(true);
      }
    });
  }
});

describe('spikes', () => {
  const spiky = new Level({ id: 'spike-test', name: 'T', world: 0, speed: 30, song: 'cyan', rows: [...Array(6).fill('====='), '=====', '=====', 'xxxxx', ...Array(20).fill('=====')] });
  it('driving into a spike row destroys the ship', () => {
    const sim = new Sim(spiky);
    for (let i = 0; i < 240 && sim.s.alive; i++) sim.step({ steer: 0, jumpPressed: false, jumpHeld: false });
    expect(sim.s.alive).toBe(false);
    expect(Math.floor(sim.s.z / CFG.tileL)).toBeGreaterThanOrEqual(7);
  });
  it('a jump on the beat before them clears a spike row', () => {
    const sim = new Sim(spiky);
    for (let i = 0; i < 360 && sim.s.alive && !sim.s.finished && sim.s.z < 20 * CFG.tileL; i++) {
      const b = spiky.beatAt(sim.s.z);
      sim.step({ steer: 0, jumpPressed: Math.abs(b - 2) < 0.05, jumpHeld: false });
    }
    expect(sim.s.alive).toBe(true);
  });
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

describe.each(LEVELS.filter((d) => d.flips && d.flips.length))('gravity flip in $name', (def) => {
  const level = new Level(def);
  const [from, to] = def.flips![0];
  const enter = () => {
    const sim = new Sim(level);
    Object.assign(sim.s, { z: from * CFG.tileL - 1, x: 0, y: 0, grounded: true });
    return sim;
  };

  it('without tapping the ship floats up and is lost', () => {
    const sim = enter();
    const types: string[] = [];
    for (let i = 0; i < 400 && sim.s.alive; i++) { sim.step({ steer: 0, jumpPressed: false, jumpHeld: false }); types.push(...sim.events.map((e) => e.type)); sim.events.length = 0; }
    expect(types).toContain('flipOn');
    expect(types).toContain('fly');
    expect(sim.s.time).toBeLessThan(1.4);
    expect(sim.s.time).toBeGreaterThan(0.8); // slow enough to react to
  });

  it('holding the button does not help: it has to be tapped', () => {
    const sim = enter();
    for (let i = 0; i < 400 && sim.s.alive; i++) sim.step({ steer: 0, jumpPressed: false, jumpHeld: true });
    expect(sim.s.alive).toBe(false);
  });

  it('is slow motion, and one calm rhythm (tap when above mid height) carries the ship through', () => {
    const sim = enter();
    let slow = Infinity, taps = 0;
    const t0 = sim.s.time;
    for (let i = 0; i < 1200 && sim.s.alive && sim.s.z < to * CFG.tileL - 4; i++) {
      // tap whenever the ship drifts above mid height: enough to stay alive on a flat run
      const tap = sim.s.y > 4 && sim.s.vy > 0;
      if (tap) taps++;
      sim.step({ steer: 0, jumpPressed: tap, jumpHeld: false });
      if (sim.s.flip) slow = Math.min(slow, sim.s.speed);
    }
    expect(sim.s.alive).toBe(true);
    expect(slow).toBeCloseTo(def.speed * CFG.flipSpeed, 1);
    expect(taps / (sim.s.time - t0)).toBeLessThan(2); // under two taps a second
  });

  it('tapping exactly once per beat holds altitude all the way through', () => {
    const sim = enter();
    let last = Math.floor(level.beatAt(sim.s.z));
    for (let i = 0; i < 3000 && sim.s.alive && sim.s.z < to * CFG.tileL - 1; i++) {
      const beat = Math.floor(level.beatAt(sim.s.z));
      sim.step({ steer: 0, jumpPressed: beat !== last && sim.s.flip, jumpHeld: false });
      last = beat;
    }
    expect(sim.s.alive, `lost at row ${Math.floor(sim.s.z / CFG.tileL)}`).toBe(true);
  });

  it('gravity returns after the zone', () => {
    const sim = enter();
    Object.assign(sim.s, { z: to * CFG.tileL - 2, y: 4, vy: 0, grounded: false, flip: true });
    const types: string[] = [];
    for (let i = 0; i < 240 && sim.s.alive && !(sim.s.grounded && !sim.s.flip); i++) { sim.step({ steer: 0, jumpPressed: false, jumpHeld: false }); types.push(...sim.events.map((e) => e.type)); sim.events.length = 0; }
    expect(types).toContain('flipOff');
    expect(sim.s.alive && sim.s.grounded).toBe(true);
  });
});

describe('sim', () => {
  const level = new Level(LEVELS[0]);
  const idle = { steer: 0, jumpPressed: false, jumpHeld: false };

  it('doing nothing falls into the first gap', () => {
    const sim = new Sim(level);
    for (let i = 0; i < 2000 && sim.s.alive; i++) sim.step(idle);
    expect(sim.s.alive).toBe(false);
    expect(sim.s.z).toBeGreaterThan(22 * CFG.tileL);
    expect(sim.s.z).toBeLessThan(26 * CFG.tileL);
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
