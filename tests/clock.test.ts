import { describe, expect, it } from 'vitest';
import { BeatClock } from '../src/audio/clock';

/** Feed the clock frames like the game does: uneven frame times, position sampled at each frame. */
function run(c: BeatClock, pos: (t: number) => number, speed: (t: number) => number, seconds: number, fps = 60, jitter = 0.004) {
  const got: { step: number; t: number }[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  for (let t = 0; t < seconds; t += 1 / fps + rnd() * jitter) got.push(...c.advance(t, pos(t), speed(t)));
  return got;
}

describe('beat clock', () => {
  it('schedules every sixteenth once, in order, at the exact time, despite frame jitter', () => {
    const c = new BeatClock();
    c.reset(0);
    const bps = 2; // 120 BPM
    const got = run(c, (t) => t * bps, () => bps, 8);
    expect(got.map((g) => g.step)).toEqual(got.map((_, i) => i));
    expect(got.length).toBeGreaterThan(60);
    for (const g of got.slice(1)) expect(Math.abs(g.t - g.step / 4 / bps)).toBeLessThan(0.002);
  });

  it('survives slow, uneven frames without dropping a step', () => {
    const c = new BeatClock();
    c.reset(0);
    const got = run(c, (t) => t * 2.75, () => 2.75, 6, 20, 0.02);
    for (let i = 1; i < got.length; i++) expect(got[i].step).toBe(got[i - 1].step + 1);
    for (const g of got.slice(2)) expect(Math.abs(g.t - g.step / 4 / 2.75)).toBeLessThan(0.004);
  });

  it('follows a speed change (boost, flip zone): later steps land where the ship will be', () => {
    const c = new BeatClock();
    c.reset(0);
    // 2 beats/s for 2 s, then half speed
    const pos = (t: number) => (t < 2 ? 2 * t : 4 + (t - 2));
    const got = run(c, pos, (t) => (t < 2 ? 2 : 1), 6);
    for (let i = 1; i < got.length; i++) expect(got[i].step).toBe(got[i - 1].step + 1);
    const late = got.filter((g) => g.t > 2.3);
    expect(late.length).toBeGreaterThan(10);
    for (const g of late) expect(Math.abs(pos(g.t) - g.step / 4)).toBeLessThan(0.01);
  });

  it('restarts from a checkpoint in the middle of the song', () => {
    const c = new BeatClock();
    c.reset(0);
    run(c, (t) => t * 2, () => 2, 3);
    c.reset(20.5);
    const got = run(c, (t) => 20.5 + t * 2, () => 2, 1);
    expect(got[0].step).toBe(82);
  });

  it('stands still when the ship does', () => {
    const c = new BeatClock();
    c.reset(4);
    expect(run(c, () => 4, () => 0, 1).length).toBe(0);
  });
});
