/** Small per-device save. Storage can be missing or throw, so everything is guarded. */
export interface Save {
  best: Record<string, number>;
  gems: Record<string, number>;
  done: Record<string, boolean>;
  stars: Record<string, number>;
  attempts: Record<string, number>;
  muted: boolean;
  /** Practice mode switch, and the checkpoint row reached on each track. */
  practiceOn: boolean;
  practice: Record<string, number>;
  lang?: 'en' | 'fi';
  /** Coins used in the shop. Coins held = coins earned (see profile.ts) minus this. */
  spent?: number;
}

const KEY = 'neonrush.save.v1';
const blank = (): Save => ({ best: {}, gems: {}, done: {}, stars: {}, attempts: {}, muted: false, practiceOn: false, practice: {} });

export function loadSave(): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...blank(), ...(JSON.parse(raw) as Partial<Save>) };
  } catch { /* fall through */ }
  return blank();
}

export function storeSave(s: Save): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* play without saving */ }
}
