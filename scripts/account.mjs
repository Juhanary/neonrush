// The account screen end to end in the real page, against a stand-in server injected before the game starts:
// node scripts/account.mjs URL OUT
// Sign in with an emailed code, nickname rules, the merge of the save, sync after playing, a reload keeps the session,
// sign out. Screenshots of each screen in English and one in Finnish, phone and small phone.
import puppeteer from 'puppeteer-core';
const [url, out] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage();
const errs = [], fail = [];
p.on('pageerror', (e) => errs.push(e.message));
const check = (ok, what) => { if (!ok) fail.push(what); };

await p.evaluateOnNewDocument(() => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const ls = localStorage;
  window.__backend = {
    user: ls.getItem('fake.user'), log: JSON.parse(ls.getItem('fake.log') || '[]'),
    nick: ls.getItem('fake.nick'), attempts: +(ls.getItem('fake.att') || 0),
    keep() { ls.setItem('fake.log', JSON.stringify(this.log)); ls.setItem('fake.att', String(this.attempts)); },
    async session() { return this.user; },
    async sendCode(e) { await wait(120); this.log.push(['send', e]); this.keep(); return { ok: true }; },
    async verify(e, c) { await wait(120); if (c !== '123456') return { ok: false, why: 'code' }; this.user = e; ls.setItem('fake.user', e); return { ok: true }; },
    async signOut() { this.user = null; ls.removeItem('fake.user'); },
    async profile() {
      if (!this.user) return { ok: false, why: 'signedOut' };
      return { ok: true, value: { nickname: this.nick, stars: 5, attempts: this.attempts, crowns: 1, coins: 550, onBoard: false } };
    },
    async setNickname(n) { await wait(80); if (n.toLowerCase() === 'taken1') return { ok: false, why: 'taken' }; this.nick = n; ls.setItem('fake.nick', n); return { ok: true }; },
    async report(r) { await wait(30); this.log.push(['run', r.level, r.attempts_delta, r.gems]); this.attempts += r.attempts_delta; this.keep(); return { ok: true }; },
  };
});

const text = (sel) => p.evaluate((s) => document.querySelector(s)?.innerText.replace(/\s+/g, ' ').trim() ?? null, sel);
const click = async (label) => {
  const ok = await p.evaluate((l) => { const btn = [...document.querySelectorAll('#accBody button')].find((x) => x.textContent.trim() === l); btn?.click(); return !!btn; }, label);
  if (!ok) fail.push(`no button "${label}"`);
  // the page runs slowly under software rendering: wait until the call is over (buttons enabled again)
  await sleep(150);
  await until(() => p.evaluate(() => ![...document.querySelectorAll('#accBody button')].some((x) => x.disabled)));
};
/** Poll until a condition holds (or 15 s pass). */
const until = async (f) => { for (let i = 0; i < 75; i++) { if (await f()) return true; await sleep(200); } return false; };
const runs = async (n) => { await until(async () => (await log()).filter((x) => x[0] === 'run').length >= n); return (await log()).filter((x) => x[0] === 'run'); };
// setting the value directly: key-by-key typing is very slow while the 3D scene renders in software
const type = (sel, v) => p.$eval(sel, (i, v) => { i.focus(); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); }, v);
const log = () => p.evaluate(() => window.__backend.log);

await p.setViewport({ width: 844, height: 390, deviceScaleFactor: 2 });
await p.goto(url + '?debug', { waitUntil: 'load' });
// a device with some progress, and English
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('neonrush.save.v1', JSON.stringify({ best: { 'cyan-drift': 100, 'solar-flare': 40 }, gems: { 'cyan-drift': 12 }, done: { 'cyan-drift': true },
    stars: { 'cyan-drift': 2 }, attempts: { 'cyan-drift': 7, 'solar-flare': 3 }, muted: true, practiceOn: false, practice: {}, lang: 'en' }));
});
await p.reload({ waitUntil: 'load' });
await sleep(2500);
check((await text('#accBtn')) === 'SIGN IN', 'menu button says SIGN IN');
await p.click('#accBtn'); await sleep(500);
check(await p.evaluate(() => document.getElementById('menu').hidden && !document.getElementById('account').hidden), 'account screen replaces the menu');
await p.screenshot({ path: `${out}/acc-1-email.png` });

await type('#acc-email', 'nope'); await click('SEND CODE');
check((await text('.accErr'))?.includes('email address'), 'bad email refused');
check((await p.$eval('#acc-email', (i) => i.value)) === 'nope', 'typed text survives the error');
await type('#acc-email', ' Me@Example.com '); await click('SEND CODE');
check(JSON.stringify((await log())[0]) === '["send","me@example.com"]', 'code sent to the cleaned address');
check((await text('.accNote'))?.includes('me@example.com'), 'code screen names the address');
await p.screenshot({ path: `${out}/acc-2-code.png` });
await type('#acc-code', '111111'); await click('SIGN IN');
check((await text('.accErr'))?.includes('Wrong or expired'), 'wrong code refused');
await type('#acc-code', '123456'); await click('SIGN IN');
await until(async () => (await text('.accNote'))?.includes('Pick a nickname'));
check((await text('.accNote'))?.includes('Pick a nickname'), 'asks for a nickname');
const merged = await runs(2);
check(JSON.stringify(merged) === JSON.stringify([['run', 'cyan-drift', 7, 12], ['run', 'solar-flare', 3, 0]]), `save merged on sign-in: ${JSON.stringify(merged)}`);
await p.screenshot({ path: `${out}/acc-3-nick.png` });
await type('#acc-nick', 'a b'); await click('SAVE NICKNAME');
check((await text('.accErr'))?.includes('3–16'), 'bad nickname refused');
await type('#acc-nick', 'taken1'); await click('SAVE NICKNAME');
check((await text('.accErr'))?.includes('already'), 'taken nickname refused');
await type('#acc-nick', 'NeonAce'); await click('SAVE NICKNAME');
await until(async () => (await text('.accNick')) === 'NeonAce');
check((await text('.accNick')) === 'NeonAce', 'signed-in view shows the nickname');
check((await text('.accStats'))?.replace(/\s/g, '').includes('550'), 'server coins shown');
await until(async () => (await text('.accSync'))?.includes('saved'));
check((await text('.accSync'))?.includes('saved'), 'says progress is saved');
await p.screenshot({ path: `${out}/acc-4-in.png` });

await p.evaluate(() => document.getElementById('accBack').click()); await sleep(500);
check((await text('#accBtn')) === 'NeonAce', 'menu button shows the nickname');
await p.screenshot({ path: `${out}/acc-5-menu.png` });

// play: one attempt, back to the menu, it reaches the server
await p.evaluate(() => document.querySelectorAll('#levels .card')[1].click()); await sleep(1500);
await p.evaluate(() => window.__game.toMenu()); await sleep(1200);
const after = (await runs(3)).slice(2);
check(JSON.stringify(after) === JSON.stringify([['run', 'solar-flare', 1, 0]]), `an attempt reaches the server as a delta: ${JSON.stringify(after)}`);

// the session survives a reload, and nothing is sent twice
await p.reload({ waitUntil: 'load' }); await sleep(1500);
await until(async () => (await text('#accBtn')) === 'NeonAce');
check((await text('#accBtn')) === 'NeonAce', 'still signed in after a reload');
check((await log()).filter((x) => x[0] === 'run').length === 3, 'nothing re-sent after a reload');

// Finnish, and a small phone
await p.evaluate(() => document.getElementById('langBtn').click()); await sleep(300);
await p.setViewport({ width: 667, height: 375, deviceScaleFactor: 2 });
await p.click('#accBtn'); await sleep(700);
check((await text('#accTitle')) === 'TILI', 'Finnish title');
const fits = await p.evaluate(() => { const r = document.getElementById('accBody').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; });
check(fits, 'fits a small phone');
await p.screenshot({ path: `${out}/acc-6-fi-small.png` });
await click('KIRJAUDU ULOS');
check((await text('#accTitle')) === 'KIRJAUDU', 'signed out');
await p.evaluate(() => document.getElementById('accBack').click()); await sleep(300);
check((await text('#accBtn')) === 'KIRJAUDU', 'menu button back to sign in');

console.log(fail.length || errs.length ? 'FAIL ' + JSON.stringify([...fail, ...errs], null, 1) : 'OK');
await b.close();
process.exit(fail.length || errs.length ? 1 : 0);
