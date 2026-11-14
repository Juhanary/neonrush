import type { InputState } from '../core/sim';

const STICK_R = 44; // px of thumb travel for full steering

/**
 * Touch: left half of the screen is a floating steering stick, right half jumps.
 * Keyboard: A/D or arrows steer, Space / W / Up jumps.
 */
export class Input {
  private keys = new Set<string>();
  private steerId = -1;
  private originX = 0;
  private touchSteer = 0;
  private jumpIds = new Set<number>();
  private keyJump = false;
  private queued = false;
  /** Any press since last check (used for "tap to continue"). */
  tapped = false;
  onStick?: (active: boolean, ox: number, oy: number, dx: number) => void;

  attach(surface: HTMLElement): void {
    const opts = { passive: false } as const;
    surface.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.tapped = true;
      const mouse = e.pointerType === 'mouse';
      // A new touch on the left always takes over steering. If the browser ever drops a pointerup
      // (system gestures, app switches), the old id would otherwise block the stick for good.
      if (!mouse && e.clientX < window.innerWidth * 0.5) {
        this.jumpIds.delete(this.steerId);
        this.steerId = e.pointerId;
        this.originX = e.clientX;
        this.touchSteer = 0;
        this.onStick?.(true, e.clientX, e.clientY, 0);
      } else {
        this.jumpIds.add(e.pointerId);
        this.queued = true;
      }
    }, opts);
    surface.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.steerId) return;
      e.preventDefault();
      let dx = e.clientX - this.originX;
      // the stick base follows the thumb so reversing direction is always instant
      if (dx > STICK_R) { this.originX = e.clientX - STICK_R; dx = STICK_R; }
      if (dx < -STICK_R) { this.originX = e.clientX + STICK_R; dx = -STICK_R; }
      const n = dx / STICK_R;
      this.touchSteer = Math.abs(n) < 0.12 ? 0 : n;
      this.onStick?.(true, this.originX, e.clientY, dx);
    }, opts);
    const up = (e: PointerEvent) => {
      if (e.pointerId === this.steerId) {
        this.steerId = -1;
        this.touchSteer = 0;
        this.onStick?.(false, 0, 0, 0);
      }
      this.jumpIds.delete(e.pointerId);
    };
    // window-level listeners: releases are seen even if the finger ends over a menu or outside the page
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    const allUp = (e: TouchEvent) => { if (e.touches.length === 0) this.release(); };
    window.addEventListener('touchend', allUp);
    window.addEventListener('touchcancel', allUp);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.release(); });
    surface.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        this.queued = true; this.keyJump = true; this.tapped = true;
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') this.keyJump = false;
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.keyJump = false; });
  }

  /** One call per simulation step; the jump press is delivered exactly once. */
  sample(): InputState {
    let steer = this.touchSteer;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) steer -= 1;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) steer += 1;
    const jumpPressed = this.queued;
    this.queued = false;
    return { steer, jumpPressed, jumpHeld: this.keyJump || this.jumpIds.size > 0 };
  }

  /** Forget every held touch. */
  release(): void {
    if (this.steerId >= 0) this.onStick?.(false, 0, 0, 0);
    this.steerId = -1;
    this.touchSteer = 0;
    this.jumpIds.clear();
  }

  clear(): void {
    this.queued = false;
    this.tapped = false;
  }
}
