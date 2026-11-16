import { describe, expect, it } from 'vitest';
import { Account, type Backend, type Profile, type Result } from '../src/net/account';
import type { RunReport } from '../src/net/sync';
import type { Save } from '../src/game/storage';

const blank = (): Save => ({ best: {}, gems: {}, done: {}, stars: {}, attempts: {}, muted: false, practiceOn: false, practice: {} });
const ok = <T>(value: T): Result<T> => ({ ok: true, value });

/** A server that keeps one account per email the way the database does: attempts add up, results by maximum. */
class FakeServer {
  accounts = new Map<string, { nick: string | null; levels: Map<string, { attempts: number; best: number; gems: number; done: boolean }> }>();
  sent: string[] = [];
  down = false;
  failAfter = Infinity;
  acc(email: string) {
    if (!this.accounts.has(email)) this.accounts.set(email, { nick: null, levels: new Map() });
    return this.accounts.get(email)!;
  }
  attempts(email: string) { let t = 0; for (const l of this.acc(email).levels.values()) t += l.attempts; return t; }
}

class FakeBackend implements Backend {
  user: string | null = null;
  constructor(public srv: FakeServer, stored: string | null = null) { this.user = stored; }
  async session() { return this.user; }
  async sendCode(email: string) { this.srv.sent.push(email); return this.srv.down ? { ok: false as const, why: 'network' as const } : ok(undefined); }
  async verify(email: string, code: string): Promise<Result> {
    if (code !== '123456') return { ok: false, why: 'code' };
    this.user = email; this.srv.acc(email); return ok(undefined);
  }
  async signOut() { this.user = null; }
  async profile(): Promise<Result<Profile>> {
    if (!this.user) return { ok: false, why: 'signedOut' };
    const a = this.srv.acc(this.user);
    return ok({ nickname: a.nick, stars: 0, attempts: this.srv.attempts(this.user), crowns: 0, coins: 0, onBoard: false });
  }
  async setNickname(nick: string): Promise<Result> {
    for (const [e, a] of this.srv.accounts) if (e !== this.user && a.nick?.toLowerCase() === nick.toLowerCase()) return { ok: false, why: 'taken' };
    this.srv.acc(this.user!).nick = nick; return ok(undefined);
  }
  async report(r: RunReport): Promise<Result> {
    if (this.srv.down || this.srv.failAfter-- <= 0) return { ok: false, why: 'network' };
    const l = this.srv.acc(this.user!).levels;
    const p = l.get(r.level) ?? { attempts: 0, best: 0, gems: 0, done: false };
    l.set(r.level, { attempts: p.attempts + r.attempts_delta, best: Math.max(p.best, r.best), gems: Math.max(p.gems, r.gems), done: p.done || r.done });
    return ok(undefined);
  }
}

const device = (srv: FakeServer, save = blank(), stored: string | null = null) => {
  const b = new FakeBackend(srv, stored);
  return { save, b, acc: new Account(b, save, () => {}) };
};
const signIn = async (acc: Account, email: string) => { await acc.sendCode(email); return acc.verify('123 456'); };

describe('account', () => {
  it('signs in with an emailed code and merges the save', async () => {
    const srv = new FakeServer();
    const d = device(srv);
    d.save.attempts['cyan-drift'] = 9; d.save.best['cyan-drift'] = 100; d.save.done['cyan-drift'] = true; d.save.gems['cyan-drift'] = 20;
    expect((await d.acc.sendCode('not-an-email')).ok).toBe(false);
    expect((await d.acc.sendCode(' Me@Example.com ')).ok).toBe(true);
    expect(srv.sent).toEqual(['me@example.com']);
    expect(d.acc.state.kind).toBe('code');
    expect(await d.acc.verify('111111')).toEqual({ ok: false, why: 'code' });
    expect((await d.acc.verify('123 456')).ok).toBe(true);
    await d.acc.sync();
    expect(srv.acc('me@example.com').levels.get('cyan-drift')).toEqual({ attempts: 9, best: 100, gems: 20, done: true });
    expect(d.acc.state).toMatchObject({ kind: 'in', synced: true, profile: { attempts: 9, nickname: null } });
  });

  it('picks a nickname, refuses a bad or taken one', async () => {
    const srv = new FakeServer();
    const a = device(srv), b = device(srv);
    await signIn(a.acc, 'a@x.fi'); await signIn(b.acc, 'b@x.fi');
    expect((await a.acc.setNickname('NeonAce')).ok).toBe(true);
    expect(await b.acc.setNickname('neonace')).toEqual({ ok: false, why: 'taken' });
    expect(await b.acc.setNickname('no spaces')).toEqual({ ok: false, why: 'nick' });
    expect(a.acc.state).toMatchObject({ profile: { nickname: 'NeonAce' } });
  });

  it('counts every attempt once across two devices and a sign-out', async () => {
    const srv = new FakeServer();
    const phone = device(srv), tablet = device(srv);
    phone.save.attempts['cyan-drift'] = 5;
    tablet.save.attempts['cyan-drift'] = 7;
    await signIn(phone.acc, 'me@x.fi'); await phone.acc.sync();
    await signIn(tablet.acc, 'me@x.fi'); await tablet.acc.sync();
    expect(srv.attempts('me@x.fi')).toBe(12);
    phone.save.attempts['cyan-drift'] = 8; await phone.acc.sync();
    expect(srv.attempts('me@x.fi')).toBe(15);
    await phone.acc.signOut();
    phone.save.attempts['cyan-drift'] = 9; // played while signed out
    await signIn(phone.acc, 'me@x.fi'); await phone.acc.sync();
    expect(srv.attempts('me@x.fi')).toBe(16);
  });

  it('gives a different account the whole save', async () => {
    const srv = new FakeServer();
    const d = device(srv);
    d.save.attempts['cyan-drift'] = 4;
    await signIn(d.acc, 'one@x.fi'); await d.acc.sync();
    await d.acc.signOut();
    await signIn(d.acc, 'two@x.fi'); await d.acc.sync();
    expect([srv.attempts('one@x.fi'), srv.attempts('two@x.fi')]).toEqual([4, 4]);
  });

  it('keeps what failed and sends it later, without doubling what got through', async () => {
    const srv = new FakeServer();
    const d = device(srv);
    for (const id of ['cyan-drift', 'solar-flare', 'toxic-pulse']) d.save.attempts[id] = 3;
    srv.failAfter = 1;
    await signIn(d.acc, 'me@x.fi'); await d.acc.sync();
    expect(d.acc.state).toMatchObject({ synced: false });
    expect(srv.attempts('me@x.fi')).toBe(3);
    srv.failAfter = Infinity;
    await d.acc.sync();
    expect(srv.attempts('me@x.fi')).toBe(9);
    expect(d.acc.state).toMatchObject({ synced: true });
  });

  it('picks up a session the device already has', async () => {
    const srv = new FakeServer();
    const d = device(srv, blank(), 'me@x.fi');
    d.save.attempts['cyan-drift'] = 2;
    await d.acc.start();
    await d.acc.sync();
    expect(d.acc.state.kind).toBe('in');
    expect(srv.attempts('me@x.fi')).toBe(2);
  });

  it('runs one sync at a time and once more for calls made meanwhile', async () => {
    const srv = new FakeServer();
    const d = device(srv);
    await signIn(d.acc, 'me@x.fi'); await d.acc.sync();
    d.save.attempts['cyan-drift'] = 1;
    const first = d.acc.sync();
    d.save.attempts['cyan-drift'] = 2;
    void d.acc.sync();
    await first;
    await d.acc.sync();
    expect(srv.attempts('me@x.fi')).toBe(2);
  });
});
