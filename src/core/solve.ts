import { Level } from './level';
import { Sim, type ShipState } from './sim';

/** How far from a beat (in beats) the rhythm bot may press jump: about a third of the time is open. */
export const BEAT_WINDOW = 0.17;

export interface SolveOptions {
  /** Simulation ticks per decision: 6 = 50 ms, 12 = 100 ms. */
  hold?: number;
  /** Checkpoint index to start from. */
  from?: number;
  /** Reaching this z alive counts as solved. */
  untilZ?: number;
  /** Jump may only be pressed within BEAT_WINDOW of a beat. */
  onBeat?: boolean;
  /** Give up after this many positions. */
  limit?: number;
  /**
   * Give up when this many positions have been explored without getting any further down the track.
   * A track that cannot be passed otherwise costs a search of everything before the spot.
   */
  stall?: number;
}

interface Frame { base: ShipState; beat: number; open: boolean; next: number; pushed: boolean }

const ACTIONS: [number, boolean][] = [[0, false], [0, true], [-1, false], [1, false], [-1, true], [1, true]];
const key = (s: ShipState): string =>
  `${Math.round(s.z * 2)}|${Math.round(s.x * 4)}|${Math.round(s.y * 4)}|${Math.round(s.vy / 2)}|${Math.round(s.vx / 4)}|${s.boost > 0 ? 1 : 0}`;

/**
 * Proves that a track can be finished: a depth-first search over coarse inputs (steer left / straight /
 * right, jump or not, one decision every `hold` ticks) on the real simulation.
 *
 * The search keeps its own stack, so it can be run a slice at a time (`run(budget)`): the level editor
 * checks a track without freezing the page, the tests run it to the end in one call.
 */
export class Solver {
  nodes = 0;
  /** Furthest z any explored state reached: where the bot got stuck when the search fails. */
  furthest = 0;
  /** Beat positions of the jump presses on the path being explored (the solution, once found). */
  readonly jumps: number[] = [];
  done = false;
  ok = false;
  private sim: Sim;
  private stack: Frame[] = [];
  private seen = new Set<string>();
  private hold: number; private untilZ: number; private onBeat: boolean; private limit: number; private stall: number;
  private mark = 0;
  /** Longest run of positions explored without progress (for tuning `stall`). */
  maxStall = 0;

  constructor(private level: Level, opt: SolveOptions = {}) {
    this.hold = opt.hold ?? 6;
    this.untilZ = opt.untilZ ?? Infinity;
    this.onBeat = !!opt.onBeat;
    this.limit = opt.limit ?? 3_000_000;
    this.stall = opt.stall ?? Infinity;
    this.sim = new Sim(level);
    this.sim.trackGems = false;
    if (opt.from) this.sim.spawnAt(level.checkpoints[opt.from]);
    this.push();
  }

  private push(): void {
    this.nodes++;
    const base = { ...this.sim.s };
    const beat = this.level.beatAt(base.z);
    this.stack.push({ base, beat, open: !this.onBeat || Math.abs(beat - Math.round(beat)) <= BEAT_WINDOW, next: 0, pushed: false });
  }

  private finish(ok: boolean): true {
    this.done = true;
    this.ok = ok;
    this.stack.length = 0;
    this.seen.clear();
    return true;
  }

  /** Explore up to `budget` more inputs. Returns true once the search is over (then read `ok`). */
  run(budget = Infinity): boolean {
    if (this.done) return true;
    const sim = this.sim;
    while (this.stack.length) {
      const f = this.stack[this.stack.length - 1];
      // back from a branch that led nowhere
      if (f.pushed) { this.jumps.pop(); f.pushed = false; }
      let deeper = false;
      while (f.next < ACTIONS.length) {
        const [steer, jump] = ACTIONS[f.next++];
        if (jump && !f.open) continue;
        if (budget-- <= 0) { f.next--; return false; }
        sim.s = { ...f.base };
        for (let i = 0; i < this.hold && sim.s.alive && !sim.s.finished; i++) sim.step({ steer, jumpPressed: jump && i === 0, jumpHeld: false });
        sim.events.length = 0;
        if (sim.s.finished || (sim.s.alive && sim.s.z >= this.untilZ)) { if (jump) this.jumps.push(f.beat); return this.finish(true); }
        if (!sim.s.alive) continue;
        if (sim.s.z > this.furthest) { this.furthest = sim.s.z; this.maxStall = Math.max(this.maxStall, this.nodes - this.mark); this.mark = this.nodes; }
        const k = key(sim.s);
        if (this.seen.has(k)) continue;
        this.seen.add(k);
        if (this.nodes >= this.limit || this.nodes - this.mark > this.stall) return this.finish(false);
        if (jump) { this.jumps.push(f.beat); f.pushed = true; }
        this.push();
        deeper = true;
        break;
      }
      if (!deeper) this.stack.pop();
    }
    return this.finish(false);
  }
}

/** Run a search to the end. */
export function solve(level: Level, hold = 6, from = 0, untilZ = Infinity, onBeat = false): { ok: boolean; nodes: number; furthest: number; jumps: number[] } {
  const s = new Solver(level, { hold, from, untilZ, onBeat });
  s.run();
  return { ok: s.ok, nodes: s.nodes, furthest: s.furthest, jumps: s.jumps };
}
