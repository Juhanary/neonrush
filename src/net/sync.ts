import type { Save } from '../game/storage';

/**
 * What of the save has not reached the server yet.
 *
 * The device save stays the truth the game plays from. Save.synced remembers, per level, what the server was last
 * told: [attempts, best %, gems, done]. A report carries the attempts made since then as a delta, so the server can
 * add them up across devices, and the best results, which the server keeps by maximum. A level is marked synced only
 * after the server accepted it, so a failed upload is simply sent again next time.
 *
 * The first sync of a device after signing in is the merge of its save into the account.
 */
export interface RunReport {
  level: string; attempts_delta: number; best: number; gems: number; done: boolean; reported_stars: number;
}
export type Synced = [attempts: number, best: number, gems: number, done: 0 | 1];

/** Level ids the server takes: official ids, and the player's own tracks. */
const LEVEL_ID = /^([a-z0-9-]{1,32}|custom:[A-Za-z0-9_-]{1,32})$/;
/** The server adds at most this many attempts per report; more are sent over several reports. */
export const MAX_DELTA = 10000;

const n = (v: unknown): number => (typeof v === 'number' && isFinite(v) && v > 0 ? Math.floor(v) : 0);

export function pending(save: Save): RunReport[] {
  const ids = new Set([...Object.keys(save.attempts), ...Object.keys(save.best), ...Object.keys(save.done)]);
  const out: RunReport[] = [];
  for (const id of ids) {
    if (!LEVEL_ID.test(id)) continue;
    const prev = save.synced?.[id] ?? [0, 0, 0, 0];
    const attempts = n(save.attempts[id]), best = Math.min(100, n(save.best[id])), gems = n(save.gems[id]), done = !!save.done[id];
    const delta = Math.min(MAX_DELTA, Math.max(0, attempts - prev[0]));
    if (delta === 0 && best <= prev[1] && gems <= prev[2] && (!done || prev[3])) continue;
    out.push({ level: id, attempts_delta: delta, best, gems, done, reported_stars: Math.min(3, n(save.stars[id])) });
  }
  // official levels first: they are what the boards show
  return out.sort((a, b) => Number(a.level.startsWith('custom:')) - Number(b.level.startsWith('custom:')));
}

/** The server accepted a report. */
export function markSynced(save: Save, r: RunReport): void {
  const prev = save.synced?.[r.level] ?? [0, 0, 0, 0];
  save.synced = { ...save.synced, [r.level]: [prev[0] + r.attempts_delta, Math.max(prev[1], r.best), Math.max(prev[2], r.gems), prev[3] || r.done ? 1 : 0] };
}
