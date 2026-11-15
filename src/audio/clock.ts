/**
 * Turns "the ship is at beat B, moving at S beats per second" (reported once per frame) into exact
 * audio times for each sixteenth. No audio or DOM here, so it is unit tested (tests/clock.test.ts).
 *
 * While the speed is steady the timeline is rigid: frame jitter in the reported position does not reach
 * the rhythm, only slow drift is trimmed. When the speed changes or the position jumps, the reported
 * position is taken as the new truth.
 */
export class BeatClock {
  /** Next sixteenth to hand out. */
  next = 0;
  /** Beats per second the timeline currently runs at (0 = standing still). */
  bps = 0;
  private anchorT = 0;
  private anchorB = 0;
  private frame = 0.016;
  private last = 0;

  reset(fromBeat = 0): void {
    this.next = Math.ceil(fromBeat * 4 - 1e-6) + 0; // + 0 turns -0 into 0
    this.bps = 0;
  }

  /** Beat position at audio time `now`, by the clock's own timeline. */
  beatAt(now: number): number {
    return this.anchorB + (now - this.anchorT) * this.bps;
  }

  /** Report the position for this frame; returns the sixteenths that should be scheduled now, with their times. */
  advance(now: number, beat: number, bps: number): { step: number; t: number }[] {
    // look further ahead when frames are slow, so a stutter in the picture never punches holes in the music
    this.frame += (Math.min(0.3, Math.max(0, now - this.last)) - this.frame) * 0.2;
    this.last = now;
    const out: { step: number; t: number }[] = [];
    if (bps < 0.01) { this.bps = 0; return out; }
    const err = beat - this.beatAt(now);
    if (this.bps === 0 || Math.abs(bps - this.bps) > 1e-6 || Math.abs(err) > 0.05) {
      this.anchorT = now; this.anchorB = beat; this.bps = bps;
    } else {
      this.anchorB += err * 0.04;
    }
    if (beat * 4 < this.next - 4) this.next = Math.ceil(beat * 4 - 1e-6); // went backwards (restart)
    const ahead = Math.max(0.13, Math.min(0.6, this.frame * 2.5));
    for (let guard = 0; guard < 32; guard++) {
      const t = this.anchorT + (this.next / 4 - this.anchorB) / this.bps;
      if (t > now + ahead) break;
      if (t > now - 0.04) out.push({ step: this.next, t: Math.max(t, now + 0.004) });
      this.next++;
    }
    return out;
  }

  /** Audio time of the next sixteenth after `now`, or `now` if that is further away than `maxWait`. */
  grid(now: number, maxWait: number): number {
    if (this.bps === 0) return now;
    const pos = this.beatAt(now) * 4;
    const wait = (Math.ceil(pos - 0.08) - pos) / (this.bps * 4);
    return wait > 0 && wait < maxWait ? now + wait : now;
  }
}
