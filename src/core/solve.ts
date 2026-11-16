import { CFG } from './config';
import { Level, gemHeight, gemLanes } from './level';
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
  /**
   * Collect every gem on the way: a run that leaves a row without the gem in it is a dead end. Proves that
   * all the gems of a track can be had in one run; when it fails, `missedGem` is the gem that could not be reached.
   */
  gems?: boolean;
}

interface Frame {
  base: ShipState; beat: number; open: boolean; next: number; pushed: boolean;
  /** Gem mode: the order the inputs are tried in, and the gems picked up in the row the ship is in. */
  order: readonly number[]; got: number[];
}

const ACTIONS: [number, boolean][] = [[0, false], [0, true], [-1, false], [1, false], [-1, true], [1, true]];
const PLAIN = [0, 1, 2, 3, 4, 5];
/**
 * Input orders that go for a gem first, by [steer: straight, left, right][jump: no, yes]: the wanted input,
 * the same steering with the other button state, then the rest.
 */
const TOWARD = [0, -1, 1].map((steer) => [false, true].map((jump) => {
  const rank = ([st, j]: [number, boolean]): number => (st === steer ? 0 : 2) + (j === jump ? 0 : 1);
  return PLAIN.slice().sort((a, b) => rank(ACTIONS[a]) - rank(ACTIONS[b]) || a - b);
}));
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
  private gems: boolean;
  /** Gem mode: gem ids (row * lanes + lane) by row, all of them in track order, and the ones any run reached. */
  private rowGems = new Map<number, number[]>();
  private allGems: number[] = [];
  private reached = new Set<number>();
  /** Longest run of positions explored without progress (for tuning `stall`). */
  maxStall = 0;

  constructor(private level: Level, opt: SolveOptions = {}) {
    this.hold = opt.hold ?? 6;
    this.untilZ = opt.untilZ ?? Infinity;
    this.onBeat = !!opt.onBeat;
    this.limit = opt.limit ?? 3_000_000;
    this.stall = opt.stall ?? Infinity;
    this.gems = !!opt.gems;
    this.sim = new Sim(level);
    this.sim.trackGems = this.gems;
    if (this.gems) {
      level.rows.forEach((row, r) => {
        const ids = gemLanes(row).map((l) => r * CFG.lanes + l);
        if (ids.length) { this.rowGems.set(r, ids); this.allGems.push(...ids); }
      });
    }
    if (opt.from) this.sim.spawnAt(level.checkpoints[opt.from]);
    this.push();
  }

  /** Total number of gems on the track (gem mode). */
  get gemCount(): number { return this.allGems.length; }

  /**
   * Gem mode, after a failed search: the first gem no run could pick up together with all the gems before
   * it, as { row, lane }. Null when every gem was reached (the track itself cannot be finished that way).
   */
  get missedGem(): { row: number; lane: number } | null {
    for (const id of this.allGems) if (!this.reached.has(id)) return { row: Math.floor(id / CFG.lanes), lane: id % CFG.lanes };
    return null;
  }

  private push(got: number[] = []): void {
    this.nodes++;
    const base = { ...this.sim.s };
    const beat = this.level.beatAt(base.z);
    let order: readonly number[] = PLAIN;
    if (this.gems) {
      // go for the next gem first, so the search does not have to stumble on it
      const L = this.level, row = L.rowOf(base.z);
      for (let r = row; r < row + 10; r++) {
        const id = this.rowGems.get(r)?.find((g) => !got.includes(g));
        if (id === undefined) continue;
        const lane = id % CFG.lanes;
        const dx = L.laneCenter(lane) - base.x, dz = (r + 0.5) * CFG.tileL - base.z;
        const want = gemHeight(L.rows[r][lane]) - 0.5;
        // in a flip zone a tap pushes the ship down; on the road a jump lifts it to a gem that hangs in the air
        const press = base.flip ? base.y > want + 0.3 : base.grounded && want > 1 && dz > 0 && dz < base.speed * 0.4;
        order = TOWARD[Math.abs(dx) < 0.35 ? 0 : dx < 0 ? 1 : 2][press ? 1 : 0];
        break;
      }
    }
    this.stack.push({ base, beat, open: !this.onBeat || Math.abs(beat - Math.round(beat)) <= BEAT_WINDOW, next: 0, pushed: false, order, got });
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
        const [steer, jump] = ACTIONS[f.order[f.next++]];
        if (jump && !f.open) continue;
        if (budget-- <= 0) { f.next--; return false; }
        sim.s = { ...f.base };
        if (this.gems) { sim.collected.clear(); for (const id of f.got) sim.collected.add(id); }
        for (let i = 0; i < this.hold && sim.s.alive && !sim.s.finished; i++) sim.step({ steer, jumpPressed: jump && i === 0, jumpHeld: false });
        sim.events.length = 0;
        let got: number[] = [];
        if (this.gems) {
          for (const id of sim.collected) this.reached.add(id);
          // a row left behind with its gem still in it: this run has failed
          const from = this.level.rowOf(f.base.z), row = this.level.rowOf(sim.s.z);
          let missed = false;
          for (let r = from; r < row && !missed; r++) for (const id of this.rowGems.get(r) ?? []) if (!sim.collected.has(id)) { missed = true; break; }
          if (missed) continue;
          for (const id of sim.collected) if (id >= row * CFG.lanes) got.push(id);
        }
        if (sim.s.finished || (sim.s.alive && sim.s.z >= this.untilZ)) { if (jump) this.jumps.push(f.beat); return this.finish(true); }
        if (!sim.s.alive) continue;
        if (sim.s.z > this.furthest) { this.furthest = sim.s.z; this.maxStall = Math.max(this.maxStall, this.nodes - this.mark); this.mark = this.nodes; }
        const k = this.gems ? key(sim.s) + '|' + got.join() : key(sim.s);
        if (this.seen.has(k)) continue;
        this.seen.add(k);
        if (this.nodes >= this.limit || this.nodes - this.mark > this.stall) return this.finish(false);
        if (jump) { this.jumps.push(f.beat); f.pushed = true; }
        this.push(got);
        deeper = true;
        break;
      }
      if (!deeper) this.stack.pop();
    }
    return this.finish(false);
  }
}

/**
 * Positions the gem search may explore without getting further before it calls a gem out of reach: three
 * times what any official track needs. Without it a gem that cannot be had costs a search of every way of
 * driving the road before it.
 */
export const GEM_STALL = 60_000;

/** Can every gem of the track be collected in one run? `missed` is the gem that cannot, when not. */
export function solveGems(level: Level, onBeat = false, hold = 6): { ok: boolean; nodes: number; gems: number; missed: { row: number; lane: number } | null } {
  const s = new Solver(level, { hold, onBeat, gems: true, stall: GEM_STALL });
  s.run();
  return { ok: s.ok, nodes: s.nodes, gems: s.gemCount, missed: s.ok ? null : s.missedGem };
}

/** Run a search to the end. */
export function solve(level: Level, hold = 6, from = 0, untilZ = Infinity, onBeat = false): { ok: boolean; nodes: number; furthest: number; jumps: number[] } {
  const s = new Solver(level, { hold, from, untilZ, onBeat });
  s.run();
  return { ok: s.ok, nodes: s.nodes, furthest: s.furthest, jumps: s.jumps };
}
