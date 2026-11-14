/** Small per-device save. Storage can be missing or throw, so everything is guarded. */
export interface Save {
  best: Record<string, number>;
  gems: Record<string, number>;
  done: Record<string, boolean>;
  attempts: Record<string, number>;
  muted: boolean;
  lang?: 'en' | 'fi';
}

const KEY = 'neonrush.save.v1';
const blank = (): Save => ({ best: {}, gems: {}, done: {}, attempts: {}, muted: false });

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
