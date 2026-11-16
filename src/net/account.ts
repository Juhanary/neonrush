import type { Save } from '../game/storage';
import { SUPABASE_KEY, SUPABASE_URL } from './config';
import { markSynced, pending, type RunReport } from './sync';

/** The player's profile as the server keeps it. */
export interface Profile { nickname: string | null; stars: number; attempts: number; crowns: number; coins: number; onBoard: boolean }

/** Why a call failed, in words the menu can show. */
export type Fail = 'network' | 'email' | 'code' | 'wait' | 'taken' | 'nick' | 'signedOut' | 'other';
export type Result<T = void> = { ok: true; value: T } | { ok: false; why: Fail };

/** The server as the account needs it. The real one is Supabase; tests pass a stand-in. */
export interface Backend {
  /** Email of the session kept on this device, or null. */
  session(): Promise<string | null>;
  sendCode(email: string): Promise<Result>;
  verify(email: string, code: string): Promise<Result>;
  signOut(): Promise<void>;
  profile(): Promise<Result<Profile>>;
  setNickname(nick: string): Promise<Result>;
  report(r: RunReport): Promise<Result>;
}

export type AccountState =
  | { kind: 'off' }                        // not signed in
  | { kind: 'code'; email: string }        // a code was sent, waiting for it
  | { kind: 'in'; email: string; profile?: Profile; syncing: boolean; synced: boolean };

export const NICK = /^[A-Za-z0-9_]{3,16}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Signing in with an emailed code, the nickname, and keeping the server up to date with the save.
 * The game plays from the device save whether or not this ever reaches the server.
 */
export class Account {
  state: AccountState = { kind: 'off' };
  onChange?: () => void;
  private busy?: Promise<void>;
  private again = false;

  constructor(private backend: Backend, private save: Save, private store: (s: Save) => void) {}

  private set(s: AccountState): void { this.state = s; this.onChange?.(); }

  /** Pick up a session this device already has. */
  async start(): Promise<void> {
    const email = await this.backend.session().catch(() => null);
    if (!email) return;
    if (this.save.syncedFor !== email) { this.save.synced = {}; this.save.syncedFor = email; this.store(this.save); }
    this.set({ kind: 'in', email, syncing: false, synced: false });
    await this.refresh();
    void this.sync();
  }

  async sendCode(email: string): Promise<Result> {
    email = email.trim().toLowerCase();
    if (!EMAIL.test(email)) return { ok: false, why: 'email' };
    const r = await this.backend.sendCode(email);
    if (r.ok) this.set({ kind: 'code', email });
    return r;
  }

  async verify(code: string): Promise<Result> {
    if (this.state.kind !== 'code') return { ok: false, why: 'other' };
    code = code.replace(/\D/g, '');
    if (code.length < 6) return { ok: false, why: 'code' };
    const email = this.state.email;
    const r = await this.backend.verify(email, code);
    if (!r.ok) return r;
    // another account than the one this device last synced with: everything in the save goes up as the merge
    if (this.save.syncedFor !== email) { this.save.synced = {}; this.save.syncedFor = email; this.store(this.save); }
    this.set({ kind: 'in', email, syncing: false, synced: false });
    await this.refresh();
    void this.sync();
    return r;
  }

  /** Back to typing the email (a wrong address, or no code came). */
  restart(): void { this.set({ kind: 'off' }); }

  async signOut(): Promise<void> {
    await this.backend.signOut().catch(() => {});
    // the save and its sync record stay: if the same account signs in again, only what is new is sent
    this.set({ kind: 'off' });
  }

  async refresh(): Promise<void> {
    if (this.state.kind !== 'in') return;
    const r = await this.backend.profile();
    if (r.ok && this.state.kind === 'in') this.set({ ...this.state, profile: r.value });
    else if (!r.ok && r.why === 'signedOut') this.set({ kind: 'off' });
  }

  async setNickname(nick: string): Promise<Result> {
    nick = nick.trim();
    if (!NICK.test(nick)) return { ok: false, why: 'nick' };
    const r = await this.backend.setNickname(nick);
    if (r.ok) await this.refresh();
    return r;
  }

  /** Send everything the server has not seen. Calls while one is running make it run once more afterwards. */
  sync(): Promise<void> {
    if (this.state.kind !== 'in') return Promise.resolve();
    if (this.busy) { this.again = true; return this.busy; }
    this.busy = (async () => {
      do {
        this.again = false;
        if (this.state.kind !== 'in') break;
        this.set({ ...this.state, syncing: true });
        let failed = false;
        for (const r of pending(this.save)) {
          const res = await this.backend.report(r);
          if (!res.ok) { failed = true; if (res.why === 'signedOut') this.set({ kind: 'off' }); break; }
          markSynced(this.save, r);
          this.store(this.save);
        }
        if (this.state.kind === 'in') this.set({ ...this.state, syncing: false, synced: !failed });
        if (!failed) await this.refresh();
        else break;
      } while (this.again);
    })().finally(() => { this.busy = undefined; });
    return this.busy;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Supabase

type Sb = import('@supabase/supabase-js').SupabaseClient;
type Err = { code?: string; status?: number; message?: string } | null;

function why(e: Err): Fail {
  if (!e) return 'other';
  const code = e.code ?? '', msg = (e.message ?? '').toLowerCase();
  if (code === '23505') return 'taken';
  if (code === '28000' || code === 'PGRST301' || e.status === 401 || msg.includes('not signed in') || msg.includes('jwt')) return 'signedOut';
  if (code === 'otp_expired' || code === 'invalid_credentials' || msg.includes('token has expired') || msg.includes('invalid')) return 'code';
  if (e.status === 429 || code.includes('rate_limit') || code === 'over_email_send_rate_limit') return 'wait';
  if (code === 'email_address_invalid' || code === 'validation_failed') return 'email';
  if (msg.includes('fetch') || msg.includes('network') || msg.includes('failed to') || e.status === 0) return 'network';
  return 'other';
}

/** The real server. The library loads only when the account is first used. */
export class SupabaseBackend implements Backend {
  private sb?: Promise<Sb>;

  private client(): Promise<Sb> {
    this.sb ??= import('@supabase/supabase-js').then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'neonrush.auth' },
    }));
    return this.sb;
  }

  /** Run a library call; `data` is typed by the caller, the library's own types are not needed. */
  private async call<T = unknown>(run: (sb: Sb) => PromiseLike<{ data: unknown; error: Err }>): Promise<Result<T>> {
    try {
      const { data, error } = await run(await this.client());
      return error ? { ok: false, why: why(error) } : { ok: true, value: data as T };
    } catch { return { ok: false, why: 'network' }; }
  }

  async session(): Promise<string | null> {
    // without a stored session there is nothing to load the library for
    try { if (!localStorage.getItem('neonrush.auth')) return null; } catch { return null; }
    const r = await this.call<{ session: { user: { email?: string } } | null }>((sb) => sb.auth.getSession());
    return r.ok ? r.value.session?.user.email ?? null : null;
  }

  async sendCode(email: string): Promise<Result> {
    const r = await this.call((sb) => sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } }));
    return r.ok ? { ok: true, value: undefined } : r;
  }

  async verify(email: string, token: string): Promise<Result> {
    const r = await this.call((sb) => sb.auth.verifyOtp({ email, token, type: 'email' }));
    return r.ok ? { ok: true, value: undefined } : r;
  }

  async signOut(): Promise<void> { await this.call((sb) => sb.auth.signOut().then((x) => ({ data: null, error: x.error }))); }

  async profile(): Promise<Result<Profile>> {
    const r = await this.call<{ nickname: string | null; stars: number; attempts: number; crowns: number; coins: number; on_board: boolean }[] | null>(
      (sb) => sb.rpc('my_profile'));
    if (!r.ok) return r;
    const p = r.value?.[0];
    if (!p) return { ok: false, why: 'signedOut' };
    return { ok: true, value: { nickname: p.nickname, stars: p.stars, attempts: Number(p.attempts), crowns: p.crowns, coins: p.coins, onBoard: p.on_board } };
  }

  async setNickname(nick: string): Promise<Result> {
    const r = await this.call((sb) => sb.rpc('set_nickname', { nick }));
    return r.ok ? { ok: true, value: undefined } : r;
  }

  async report(rep: RunReport): Promise<Result> {
    const r = await this.call((sb) => sb.rpc('record_run', { ...rep }));
    return r.ok ? { ok: true, value: undefined } : r;
  }
}
