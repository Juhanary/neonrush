import { sanitize, type CustomLevel } from '../core/custom';

/**
 * Where the player's own tracks live on this device.
 *
 * The track itself (rows, tempo, analysis results) is small text in localStorage. The music file is
 * megabytes, so it goes to IndexedDB under the track's id. Either store can be missing or refuse
 * (private windows, embedded pages), so everything is guarded: without localStorage tracks last for the
 * session, without IndexedDB the music does, and a track whose file is gone plays its built-in song.
 */
const KEY = 'neonrush.custom.v1';
const DB = 'neonrush', FILES = 'audio';

export class CustomStore {
  private levels: CustomLevel[] = [];
  /** Files kept in memory when IndexedDB is not available. */
  private mem = new Map<string, ArrayBuffer>();
  private db?: Promise<IDBDatabase | null>;

  constructor() {
    try {
      const raw = localStorage.getItem(KEY);
      const arr: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(arr)) this.levels = arr.map(sanitize).filter((l): l is CustomLevel => !!l);
    } catch { /* start empty */ }
  }

  list(): CustomLevel[] { return this.levels; }
  get(id: string): CustomLevel | undefined { return this.levels.find((l) => l.id === id); }

  newId(): string {
    for (;;) {
      const id = Math.random().toString(36).slice(2, 10);
      if (id && !this.get(id)) return id;
    }
  }

  put(level: CustomLevel): void {
    level.updated = Date.now();
    const i = this.levels.findIndex((l) => l.id === level.id);
    if (i >= 0) this.levels[i] = level; else this.levels.push(level);
    this.flush();
  }

  remove(id: string): void {
    this.levels = this.levels.filter((l) => l.id !== id);
    this.flush();
    this.mem.delete(id);
    void this.tx('readwrite', (s) => s.delete(id));
  }

  private flush(): void {
    try { localStorage.setItem(KEY, JSON.stringify(this.levels)); } catch { /* keep them in memory */ }
  }

  private open(): Promise<IDBDatabase | null> {
    this.db ??= new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => { req.result.createObjectStore(FILES); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch { resolve(null); }
    });
    return this.db;
  }

  private async tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
    const db = await this.open();
    if (!db) return undefined;
    return new Promise((resolve) => {
      try {
        const t = db.transaction(FILES, mode);
        const req = run(t.objectStore(FILES));
        let value: T | undefined;
        req.onsuccess = () => { value = req.result; if (mode === 'readonly') resolve(value); };
        req.onerror = () => resolve(undefined);
        t.oncomplete = () => resolve(value);
        t.onabort = () => resolve(undefined);
      } catch { resolve(undefined); }
    });
  }

  /** Keep the music file of a track. Returns false when it could only be kept for this session. */
  async putAudio(id: string, data: ArrayBuffer): Promise<boolean> {
    this.mem.set(id, data);
    const key = await this.tx('readwrite', (s) => s.put(data, id));
    if (key === undefined) return false;
    this.mem.delete(id);
    return true;
  }

  async getAudio(id: string): Promise<ArrayBuffer | null> {
    const m = this.mem.get(id);
    if (m) return m;
    const v = await this.tx<unknown>('readonly', (s) => s.get(id));
    return v instanceof ArrayBuffer ? v : null;
  }

  removeAudio(id: string): void {
    this.mem.delete(id);
    void this.tx('readwrite', (s) => s.delete(id));
  }
}
