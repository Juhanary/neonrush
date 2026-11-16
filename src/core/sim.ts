import { CFG } from './config';
import { Level, gemHeight, gemReach, isGem, type Checkpoint } from './level';

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
  | { type: 'flipOn' }
  | { type: 'flipOff' }
  | { type: 'thrust' }
  | { type: 'crash' }
  | { type: 'fall' }
  | { type: 'fly' }
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
  /** Inside a gravity-flip zone. */
  flip: boolean;
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
      grounded: true, coyote: 0, buffer: 0, boost: 0, flip: false,
      alive: true, finished: false, time: 0, padRow: -1, missRow: -1,
    };
    this.collected.clear();
    this.events = [];
  }

  /**
   * Practice mode: start the run from a checkpoint instead of the start line.
   * Moving roads depend on the ship's beat position, not on the clock, so they are always in the same phase here.
   */
  spawnAt(cp: Checkpoint): void {
    this.reset();
    const s = this.s, L = this.level;
    s.x = cp.x; s.z = cp.z;
    s.time = cp.z / L.def.speed;
    s.flip = L.inFlip(cp.z);
    if (s.flip) s.speed = L.def.speed * CFG.flipSpeed;
  }

  private h(x: number, z: number): number | null {
    return this.level.heightAt(x, z, this.level.beatAt(this.s.z), this.s.y);
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
    const onIce = s.grounded && L.tile(L.rowOf(s.z), L.laneOf(s.x)) === 'i';
    const dv = CFG.steerAccel * (onIce ? CFG.iceGrip : 1) * dt;
    s.vx += Math.max(-dv, Math.min(dv, target - s.vx));
    if (s.vx !== 0) {
      const nx = s.x + s.vx * dt;
      const edge = nx + Math.sign(s.vx) * CFG.shipHalfW;
      const hA = this.h(edge, s.z + CFG.shipHalfL * 0.6);
      const hB = this.h(edge, s.z - CFG.shipHalfL * 0.6);
      const wall = Math.max(hA ?? -99, hB ?? -99);
      if (wall > s.y + CFG.stepTol) s.vx = 0; // slide along walls, no unfair side deaths
      else s.x = nx;
    }

    // --- forward ----------------------------------------------------------
    if (s.boost > 0) s.boost -= dt;
    // a gravity-flip zone is slow motion: the ship brakes hard on the way in and the boost is cancelled
    if (s.flip) s.boost = 0;
    const want = s.flip ? L.def.speed * CFG.flipSpeed : s.boost > 0 ? CFG.boostSpeed : L.def.speed;
    if (s.speed < want) s.speed = Math.min(want, s.speed + CFG.speedAccel * dt);
    else s.speed = Math.max(want, s.speed - (s.flip ? CFG.flipBrake : CFG.speedDecel) * dt);
    const nz = s.z + s.speed * dt;
    const front = nz + CFG.shipHalfL;
    // a ship in the air that meets the top of a block a little too low is lifted onto it (CFG.ledgeAssist)
    const inAir = !s.grounded && !s.flip;
    let lift = -Infinity;
    for (const off of [-0.8, 0.8]) {
      const h = L.heightAt(s.x + off * CFG.shipHalfW, front, L.beatAt(s.z), s.y, inAir ? CFG.airLedge : CFG.stepTol);
      if (h !== null && h > s.y + CFG.stepTol) {
        // only onto the top of a block or an air block: a ship that has dropped into a gap stays in it
        if (inAir && h >= CFG.blockH && h <= s.y + (h === CFG.airHi ? CFG.airLedge : CFG.ledgeAssist)) { lift = Math.max(lift, h); continue; }
        s.alive = false;
        this.events.push({ type: 'crash' });
        return;
      }
    }
    if (lift > s.y) { s.y = lift; s.vy = Math.max(s.vy, 0); }
    s.z = nz;

    const flip = L.inFlip(s.z);
    if (flip !== s.flip) {
      s.flip = flip;
      this.events.push({ type: flip ? 'flipOn' : 'flipOff' });
    }

    let ground: number | null = null;
    for (const off of [-0.7, 0, 0.7]) {
      const h = this.h(s.x + off * CFG.shipHalfW, s.z);
      if (h !== null && (ground === null || h > ground)) ground = h;
    }

    if (flip) {
      // --- reversed gravity: the ship drifts up; every tap kicks it back down
      s.coyote = 0;
      s.buffer = 0;
      if (input.jumpPressed) {
        s.vy = -CFG.flipThrust;
        this.events.push({ type: 'thrust' });
      }
      s.grounded = false;
      s.vy += L.flipGravity * dt;
      s.y += s.vy * dt;
      if (ground !== null && s.vy < 0 && s.y <= ground) {
        s.y = ground;
        s.vy = 0;
        s.grounded = true;
      }
      if (s.y > CFG.flipCeil) {
        s.alive = false;
        this.events.push({ type: 'fly' });
        return;
      }
    } else {
      // --- jump -----------------------------------------------------------
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

      // --- vertical -------------------------------------------------------
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
    }

    // --- spikes: any part of the (slightly shrunk) footprint over a spike tile, below its tip ---
    if (s.y < CFG.spikeH) {
      const hx = CFG.shipHalfW - CFG.spikeInset, hz = CFG.shipHalfL - CFG.spikeInset;
      for (const [dx, dz] of [[-hx, hz], [hx, hz], [-hx, -hz], [hx, -hz], [0, 0]]) {
        if (L.tile(L.rowOf(s.z + dz), L.laneOf(s.x + dx)) === 'x') {
          s.alive = false;
          this.events.push({ type: 'crash' });
          return;
        }
      }
    }

    // --- air blocks: the same footprint, when the ship is at their height. From the step tolerance under
    // the top upwards the block is a platform instead (Level.heightAt): it can be landed on and driven across.
    if (s.y + CFG.shipH > CFG.airLo && s.y < CFG.airHi - CFG.stepTol) {
      const hx = CFG.shipHalfW - CFG.spikeInset, hz = CFG.shipHalfL - CFG.spikeInset;
      for (const [dx, dz] of [[-hx, hz], [hx, hz], [-hx, -hz], [hx, -hz], [0, 0]]) {
        if (L.tile(L.rowOf(s.z + dz), L.laneOf(s.x + dx)) === 'n') {
          s.alive = false;
          this.events.push({ type: 'crash' });
          return;
        }
      }
    }

    // --- tiles under the ship ---------------------------------------------
    const row = L.rowOf(s.z);
    const lane = L.laneOf(s.x);
    const t = L.tile(row, lane);
    if (s.grounded && !flip && row !== s.padRow) {
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
        // picked up at the middle of the tile, where the gem is drawn and where the beat falls
        if (s.z >= (row + 0.5) * CFG.tileL - 0.5 && Math.abs(s.y + 0.5 - gy) < gemReach(t)) {
          this.collected.add(id);
          this.events.push({ type: 'gem', x: L.laneCenter(lane), y: gy, z: (row + 0.5) * CFG.tileL, id });
        }
      }
    }

    if (this.trackGems && row !== s.missRow) {
      s.missRow = row;
      for (const side of [-1, 1]) {
        const h = this.h(s.x + side * (CFG.shipHalfW + 0.45), s.z);
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
