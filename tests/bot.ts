import { Level } from '../src/core/level';
import { Sim, type ShipState } from '../src/core/sim';

/** Depth-first search over coarse inputs: proves a level can be finished. */
/** How far from a beat (in beats) the rhythm bot may press jump: about a third of the time is open. */
export const BEAT_WINDOW = 0.17;

export function solve(level: Level, HOLD = 6, from = 0, untilZ = Infinity, onBeat = false): { ok: boolean; nodes: number; furthest: number; jumps: number[] } {
  const sim = new Sim(level);
  sim.trackGems = false;
  if (from > 0) sim.spawnAt(level.checkpoints[from]);
  // HOLD = ticks per decision (6 = 50 ms, 12 = 100 ms)
  const actions: [number, boolean][] = [[0, false], [0, true], [-1, false], [1, false], [-1, true], [1, true]];
  const seen = new Set<string>();
  let nodes = 0;
  let furthest = 0;
  /** Beat positions of the jump presses on the path that is being explored (the solution, once found). */
  const jumps: number[] = [];
  const key = (s: ShipState) =>
    `${Math.round(s.z * 2)}|${Math.round(s.x * 4)}|${Math.round(s.y * 4)}|${Math.round(s.vy / 2)}|${Math.round(s.vx / 4)}|${s.boost > 0 ? 1 : 0}`;

  const dfs = (): boolean => {
    if (++nodes > 3_000_000) return false;
    const base = { ...sim.s };
    const b = level.beatAt(base.z);
    const beatOpen = !onBeat || Math.abs(b - Math.round(b)) <= BEAT_WINDOW;
    for (const [steer, jump] of actions) {
      if (jump && !beatOpen) continue;
      sim.s = { ...base };
      for (let i = 0; i < HOLD && sim.s.alive && !sim.s.finished; i++) {
        sim.step({ steer, jumpPressed: jump && i === 0, jumpHeld: false });
      }
      sim.events.length = 0;
      if (sim.s.finished || (sim.s.alive && sim.s.z >= untilZ)) { if (jump) jumps.push(b); return true; }
      if (!sim.s.alive) continue;
      furthest = Math.max(furthest, sim.s.z);
      const k = key(sim.s);
      if (seen.has(k)) continue;
      seen.add(k);
      if (jump) jumps.push(b);
      if (dfs()) return true;
      if (jump) jumps.pop();
    }
    return false;
  };
  return { ok: dfs(), nodes, furthest, jumps };
}

