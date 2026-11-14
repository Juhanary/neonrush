import { CFG } from './config';
import { Level, gemHeight, gemReach, isGem } from './level';

export interface InputState {
  /** -1 (left) .. 1 (right) */
  steer: number;
  jumpPressed: boolean;
  jumpHeld: boolean;
}

export type SimEvent =
  | { type: 'jump' }
  | { type: 'pad' }
  | { type: 'boost' }
  | { type: 'land'; impact: number }
  | { type: 'gem'; x: number; y: number; z: number; id: number }
  | { type: 'nearMiss'; side: number }
  | { type: 'crash' }
  | { type: 'fall' }
  | { type: 'finish' };

export interface ShipState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  speed: number;
  grounded: boolean;
  coyote: number;
  buffer: number;
  boost: number;
  alive: boolean;
  finished: boolean;
  time: number;
  padRow: number;
  missRow: number;
}

/**
 * Deterministic fixed-step gameplay simulation. No rendering, audio or DOM:
 * the presentation layer reads `s` and drains `events`.
 */
export class Sim {
  s!: ShipState;
  readonly collected = new Set<number>();
  events: SimEvent[] = [];
  /** Bots turn this off so cloned states stay cheap. */
  trackGems = true;

  constructor(readonly level: Level) {
    this.reset();
  }

  reset(): void {
    this.s = {
      x: 0, y: 0, z: 2, vx: 0, vy: 0, speed: this.level.def.speed,
      grounded: true, coyote: 0, buffer: 0, boost: 0,
      alive: true, finished: false, time: 0, padRow: -1, missRow: -1,
    };
    this.collected.clear();
    this.events = [];
  }

  step(input: InputState): void {
    const s = this.s;
    if (!s.alive || s.finished) return;
    const dt = CFG.dt;
    const L = this.level;
    s.time += dt;

    // --- steering ---------------------------------------------------------
    const steer = Math.max(-1, Math.min(1, input.steer));
    const target = steer * CFG.steerSpeed;
    const dv = CFG.steerAccel * dt;
    s.vx += Math.max(-dv, Math.min(dv, target - s.vx));
    if (s.vx !== 0) {
      const nx = s.x + s.vx * dt;
      const edge = nx + Math.sign(s.vx) * CFG.shipHalfW;
      const hA = L.heightAt(edge, s.z + CFG.shipHalfL * 0.6);
      const hB = L.heightAt(edge, s.z - CFG.shipHalfL * 0.6);
      const wall = Math.max(hA ?? -99, hB ?? -99);
      if (wall > s.y + CFG.stepTol) s.vx = 0; // slide along walls, no unfair side deaths
      else s.x = nx;
    }

    // --- forward ----------------------------------------------------------
    if (s.boost > 0) s.boost -= dt;
    const want = s.boost > 0 ? CFG.boostSpeed : L.def.speed;
    if (s.speed < want) s.speed = Math.min(want, s.speed + CFG.speedAccel * dt);
    else s.speed = Math.max(want, s.speed - CFG.speedDecel * dt);
    const nz = s.z + s.speed * dt;
    const front = nz + CFG.shipHalfL;
    for (const off of [-0.8, 0.8]) {
      const h = L.heightAt(s.x + off * CFG.shipHalfW, front);
      if (h !== null && h > s.y + CFG.stepTol) {
        s.alive = false;
        this.events.push({ type: 'crash' });
        return;
      }
    }
    s.z = nz;

    // --- jump -------------------------------------------------------------
    s.coyote = s.grounded ? CFG.coyote : s.coyote - dt;
    if (input.jumpPressed) s.buffer = CFG.jumpBuffer;
    else if (input.jumpHeld && s.grounded) s.buffer = dt * 2;
    else s.buffer -= dt;
    if (s.buffer > 0 && s.coyote > 0) {
      s.vy = CFG.jumpVel;
      s.grounded = false;
      s.coyote = 0;
      s.buffer = 0;
      this.events.push({ type: 'jump' });
    }

    // --- vertical ---------------------------------------------------------
    let ground: number | null = null;
    for (const off of [-0.7, 0, 0.7]) {
      const h = L.heightAt(s.x + off * CFG.shipHalfW, s.z);
      if (h !== null && (ground === null || h > ground)) ground = h;
    }
    if (s.grounded && ground !== null && ground >= s.y - 0.001) {
      s.y = ground;
      s.vy = 0;
    } else {
      const was = s.grounded;
      s.grounded = false;
      s.vy -= CFG.gravity * dt;
      s.y += s.vy * dt;
      if (ground !== null && s.vy <= 0 && s.y <= ground) {
        const impact = -s.vy;
        s.y = ground;
        s.vy = 0;
        s.grounded = true;
        if (!was) this.events.push({ type: 'land', impact });
      }
    }

    // --- tiles under the ship ---------------------------------------------
    const row = L.rowOf(s.z);
    const lane = L.laneOf(s.x);
    const t = L.tile(row, lane);
    if (s.grounded && row !== s.padRow) {
      if (t === '^') {
        s.padRow = row;
        s.vy = CFG.padJumpVel;
        s.grounded = false;
        s.coyote = 0;
        this.events.push({ type: 'pad' });
      } else if (t === '>') {
        s.padRow = row;
        s.boost = CFG.boostTime;
        this.events.push({ type: 'boost' });
      }
    }

    if (this.trackGems && isGem(t)) {
      const id = row * CFG.lanes + lane;
      if (!this.collected.has(id)) {
        const gy = gemHeight(t);
        if (Math.abs(s.y + 0.5 - gy) < gemReach(t)) {
          this.collected.add(id);
          this.events.push({ type: 'gem', x: L.laneCenter(lane), y: gy, z: (row + 0.5) * CFG.tileL, id });
        }
      }
    }

    if (this.trackGems && row !== s.missRow) {
      s.missRow = row;
      for (const side of [-1, 1]) {
        const h = L.heightAt(s.x + side * (CFG.shipHalfW + 0.45), s.z);
        if (h !== null && h > s.y + CFG.stepTol) this.events.push({ type: 'nearMiss', side });
      }
    }

    // --- end states -------------------------------------------------------
    if (s.y < CFG.fallY) {
      s.alive = false;
      this.events.push({ type: 'fall' });
    } else if (s.z >= L.finishZ) {
      s.finished = true;
      this.events.push({ type: 'finish' });
    }
  }
}
