import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/core/levels';
import { BOARD_MIN_STARS, COINS_PER_STAR, playerStats } from '../src/game/profile';
import type { Save } from '../src/game/storage';

const blank = (): Save => ({ best: {}, gems: {}, done: {}, stars: {}, attempts: {}, muted: false, practiceOn: false, practice: {} });
const ids = LEVELS.map((l) => l.id);

describe('player stats', () => {
  it('start at nothing', () => {
    const s = playerStats(blank(), ids);
    expect(s).toMatchObject({ stars: 0, finished: 0, gems: 0, attempts: 0, coins: 0, onBoard: false });
    expect(s.starMax).toBe(ids.length * 3);
    expect(s.tracks).toBe(ids.length);
  });

  it('add up the official tracks', () => {
    const save = blank();
    save.stars[ids[0]] = 3; save.done[ids[0]] = true; save.gems[ids[0]] = 12; save.attempts[ids[0]] = 7;
    save.stars[ids[1]] = 1; save.done[ids[1]] = true; save.gems[ids[1]] = 2; save.attempts[ids[1]] = 30;
    save.attempts[ids[2]] = 5; // tried, not finished
    const s = playerStats(save, ids);
    expect(s).toMatchObject({ stars: 4, finished: 2, gems: 14, attempts: 42, attemptsOfficial: 42, coinsEarned: 4 * COINS_PER_STAR });
  });

  it('give no stars or coins for a track of the player\'s own, but count its attempts', () => {
    const save = blank();
    save.stars['custom:abc'] = 3; save.done['custom:abc'] = true; save.gems['custom:abc'] = 9; save.attempts['custom:abc'] = 11;
    save.attempts[ids[0]] = 4;
    const s = playerStats(save, ids);
    expect(s).toMatchObject({ stars: 0, finished: 0, gems: 0, coins: 0, attempts: 15, attemptsOfficial: 4 });
  });

  it('take coins used off the coins earned, never below zero', () => {
    const save = blank();
    for (const id of ids.slice(0, 3)) save.stars[id] = 3;
    save.spent = 40;
    expect(playerStats(save, ids).coins).toBe(9 * COINS_PER_STAR - 40);
    save.spent = 100000;
    expect(playerStats(save, ids).coins).toBe(0);
  });

  it('put a player on the board at the threshold', () => {
    const save = blank();
    let left = BOARD_MIN_STARS;
    for (const id of ids) { const n = Math.min(3, left); save.stars[id] = n; left -= n; }
    expect(left).toBe(0);
    expect(playerStats(save, ids).onBoard).toBe(true);
    save.stars[ids[0]]--;
    expect(playerStats(save, ids).onBoard).toBe(false);
  });

  it('survive a damaged save', () => {
    const save = blank();
    (save.stars as Record<string, unknown>)[ids[0]] = 'x';
    save.stars[ids[1]] = 99; save.stars[ids[2]] = -4; save.attempts[ids[0]] = NaN; save.attempts['old-track'] = 50;
    const s = playerStats(save, ids);
    expect(s.stars).toBe(3);
    expect(s.attempts).toBe(0);
  });
});

describe('server schema', () => {
  it('knows every official level and its gem total', async () => {
    // vite reads the migration files as text
    const files = import.meta.glob('../supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    const sql = Object.keys(files).sort().map((f) => files[f]).join('\n');
    const { Level } = await import('../src/core/level');
    const seeded = new Map([...sql.matchAll(/\('([a-z0-9-]+)', (\d+)\)/g)].map((m) => [m[1], +m[2]]));
    for (const d of LEVELS) expect([d.id, seeded.get(d.id)]).toEqual([d.id, new Level(d).gemCount]);
    expect(seeded.size).toBeGreaterThanOrEqual(LEVELS.length);
  });
});
