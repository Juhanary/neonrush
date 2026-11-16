import type { Account, Fail, Result } from '../net/account';
import { BOARD_MIN_STARS } from '../game/profile';

const $ = (id: string) => document.getElementById(id)!;

/** Make an element; text goes in as text, never as markup (emails and nicknames come from players). */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

/**
 * The account screen: sign in with an emailed code, pick a nickname, see what the account holds.
 * Opens from the menu; knows the account, nothing of the game.
 */
export class AccountPanel {
  private panel = $('account');
  private body = $('accBody');
  private error = '';
  private renaming = false;
  private busy = false;

  constructor(private acc: Account, private t: (k: string) => string, private back: () => void) {
    $('accBack').addEventListener('click', () => this.close());
  }

  get open(): boolean { return !this.panel.hidden; }

  show(): void { this.error = ''; this.renaming = false; this.panel.hidden = false; this.render(); void this.acc.refresh(); }
  close(): void { this.panel.hidden = true; this.back(); }

  /** The menu button: the nickname once there is one. */
  label(): string {
    const s = this.acc.state;
    if (s.kind !== 'in') return this.t('acc.signIn');
    return s.profile?.nickname ?? this.t('acc.title');
  }

  render(): void {
    if (this.panel.hidden) return;
    const s = this.acc.state, b = this.body;
    // what was typed survives a redraw (after an error, or when the state changes underneath)
    const kept = new Map([...b.querySelectorAll('input')].map((i) => [i.id, i.value]));
    b.textContent = '';
    $('accTitle').textContent = this.t(s.kind === 'in' ? 'acc.title' : 'acc.signIn');
    if (s.kind === 'off') {
      b.append(el('p', 'accNote', this.t('acc.why')));
      const input = this.input('email', 'email', this.t('acc.emailPh'));
      b.append(input, this.button(this.t('acc.send'), () => this.acc.sendCode(input.value), 'big'));
    } else if (s.kind === 'code') {
      b.append(el('p', 'accNote', this.t('acc.sent').replace('{email}', s.email)));
      const input = this.input('code', 'one-time-code', '123456');
      input.inputMode = 'numeric';
      input.maxLength = 10;
      const row = el('div', 'row');
      row.append(this.button(this.t('acc.resend'), () => this.acc.sendCode(s.email)), this.button(this.t('acc.other'), async () => { this.acc.restart(); return { ok: true, value: undefined }; }));
      b.append(input, this.button(this.t('acc.verify'), () => this.acc.verify(input.value), 'big'), row);
    } else if (!s.profile) {
      b.append(el('p', 'accNote', this.t(s.syncing ? 'acc.saving' : 'acc.loading')));
    } else if (!s.profile.nickname || this.renaming) {
      b.append(el('p', 'accNote', this.t('acc.pickNick')));
      const input = this.input('nick', 'nickname', 'NeonAce');
      input.maxLength = 16;
      if (s.profile.nickname) input.value = s.profile.nickname;
      b.append(input, this.button(this.t('acc.saveNick'), async () => {
        const r = await this.acc.setNickname(input.value);
        if (r.ok) this.renaming = false;
        return r;
      }, 'big'));
    } else {
      const p = s.profile;
      b.append(el('div', 'accNick', p.nickname ?? ''), el('p', 'accMail', s.email));
      const stats = el('div', 'accStats');
      const stat = (icon: string, v: number, k: string, cls = '') => {
        const box = el('span', cls), big = el('b');
        if (icon) big.append(el('i', '', icon));
        big.append(String(v));
        box.append(big, el('small', '', this.t(k)));
        stats.append(box);
      };
      stat('★', p.stars, 'stars', 'star');
      stat('♛', p.crowns, 'acc.crowns', 'crown');
      stat('', p.coins, 'coins', 'coin');
      stat('', p.attempts, 'attempts');
      stats.querySelector('.coin b')!.prepend(el('i', 'coinIcon'));
      b.append(stats);
      b.append(el('p', 'accNote', p.onBoard ? this.t('acc.onBoard') : this.t('acc.offBoard').replace('{n}', String(BOARD_MIN_STARS))));
      b.append(el('p', 'accSync' + (s.synced || s.syncing ? '' : ' warn'), this.t(s.syncing ? 'acc.saving' : s.synced ? 'acc.saved' : 'acc.notSaved')));
      const row = el('div', 'row');
      row.append(
        this.button(this.t('acc.rename'), async () => { this.renaming = true; return { ok: true, value: undefined }; }),
        this.button(this.t('acc.signOut'), async () => { await this.acc.signOut(); return { ok: true, value: undefined }; }),
      );
      b.append(row);
    }
    for (const i of b.querySelectorAll('input')) { const v = kept.get(i.id); if (v) i.value = v; }
    if (this.error) b.append(el('p', 'accErr', this.error));
  }

  private input(id: string, auto: string, ph: string): HTMLInputElement {
    const i = el('input');
    i.id = 'acc-' + id;
    i.type = id === 'email' ? 'email' : 'text';
    i.setAttribute('autocomplete', auto);
    i.placeholder = ph;
    i.spellcheck = false;
    i.autocapitalize = 'off';
    i.addEventListener('keydown', (e) => { if (e.key === 'Enter') (i.parentElement?.querySelector('button.big') as HTMLButtonElement | null)?.click(); });
    return i;
  }

  private button(text: string, run: () => Promise<Result>, cls = 'ghost'): HTMLButtonElement {
    const btn = el('button', cls, text);
    btn.addEventListener('click', async () => {
      if (this.busy) return;
      this.busy = true;
      this.body.querySelectorAll('button').forEach((x) => { x.disabled = true; });
      const r = await run().catch((): Result => ({ ok: false, why: 'other' }));
      this.busy = false;
      this.error = r.ok ? '' : this.t('acc.err.' + (r.why satisfies Fail));
      this.render();
      // keep the typing where it was
      (this.body.querySelector('input') as HTMLInputElement | null)?.focus({ preventScroll: true });
    });
    return btn;
  }
}
