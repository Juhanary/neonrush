import { describe, expect, it } from 'vitest';
import { MAX_DELTA, markSynced, pending } from '../src/net/sync';
import type { Save } from '../src/game/storage';

const blank = (): Save => ({ best: {}, gems: {}, done: {}, stars: {}, attempts: {}, muted: false, practiceOn: false, practice: {} });
const flush = (s: Save) => { for (const r of pending(s)) markSynced(s, r); };

describe('sync', () => {
  it('sends the whole save the first time (the merge)', () => {
    const s = blank();
    s.attempts['cyan-drift'] = 12; s.best['cyan-drift'] = 100; s.done['cyan-drift'] = true; s.gems['cyan-drift'] = 15; s.stars['cyan-drift'] = 2;
    s.attempts['solar-flare'] = 4; s.best['solar-flare'] = 37;
    s.attempts['custom:ab12cd34'] = 3;
    const p = pending(s);
    expect(p).toEqual([
      { level: 'cyan-drift', attempts_delta: 12, best: 100, gems: 15, done: true, reported_stars: 2 },
      { level: 'solar-flare', attempts_delta: 4, best: 37, gems: 0, done: false, reported_stars: 0 },
      { level: 'custom:ab12cd34', attempts_delta: 3, best: 0, gems: 0, done: false, reported_stars: 0 },
    ]);
  });

  it('sends nothing once synced, then only what changed, with attempts as a delta', () => {
    const s = blank();
    s.attempts['cyan-drift'] = 12; s.best['cyan-drift'] = 60; s.attempts['solar-flare'] = 4;
    flush(s);
    expect(pending(s)).toEqual([]);
    s.attempts['cyan-drift'] = 15;
    expect(pending(s)).toEqual([{ level: 'cyan-drift', attempts_delta: 3, best: 60, gems: 0, done: false, reported_stars: 0 }]);
    flush(s);
    s.best['solar-flare'] = 10; // a better result without a new attempt being counted yet
    expect(pending(s).map((r) => [r.level, r.attempts_delta, r.best])).toEqual([['solar-flare', 0, 10]]);
  });

  it('sends again what failed', () => {
    const s = blank();
    s.attempts['cyan-drift'] = 2;
    expect(pending(s)).toHaveLength(1); // not marked: the upload failed
    expect(pending(s)[0].attempts_delta).toBe(2);
  });

  it('does not resend a worse result after a track was edited', () => {
    const s = blank();
    s.attempts['custom:x'] = 5; s.best['custom:x'] = 100; s.done['custom:x'] = true; s.gems['custom:x'] = 4;
    flush(s);
    delete s.best['custom:x']; delete s.done['custom:x']; delete s.gems['custom:x']; // editing clears the records
    s.best['custom:x'] = 30;
    expect(pending(s)).toEqual([]);
  });

  it('splits a huge attempt count and skips ids the server would refuse', () => {
    const s = blank();
    s.attempts['cyan-drift'] = MAX_DELTA * 2 + 5;
    s.attempts['Bad Id!'] = 3; s.attempts['custom:'] = 1;
    let sent = 0, rounds = 0;
    for (let p = pending(s); p.length; p = pending(s), rounds++) for (const r of p) { sent += r.attempts_delta; markSynced(s, r); }
    expect(sent).toBe(MAX_DELTA * 2 + 5);
    expect(rounds).toBe(3);
  });
});
