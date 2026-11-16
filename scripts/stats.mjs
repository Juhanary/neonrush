// Player stats in the menu and coins on the finish panel: node scripts/stats.mjs URL OUT
// Seeds a save, reads the corner strip in both languages and two phone sizes, checks it stays clear of the logo and
// the cards, then finishes a track for a first star and checks the coins and the attempt count.
import puppeteer from 'puppeteer-core';
const [url, out] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
const fail = [];
const check = (ok, what) => { if (!ok) fail.push(what); };

const seed = { best: { cyan: 100, solar: 100, toxic: 41, 'custom:abc': 100 }, gems: { cyan: 20, solar: 11 }, done: { cyan: true, solar: true, 'custom:abc': true },
  stars: { cyan: 3, solar: 2, 'custom:abc': 3 }, attempts: { cyan: 14, solar: 37, toxic: 9, 'custom:abc': 6 }, muted: true, practiceOn: false, practice: {}, lang: 'en' };
await p.setViewport({ width: 844, height: 390, deviceScaleFactor: 2 });
await p.goto(url + '?debug', { waitUntil: 'load' });
const ids = await p.evaluate(() => window.__game.levels.map((l) => l.def.id));
// the seed names the first three official tracks, whatever their ids are
const ren = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [{ cyan: ids[0], solar: ids[1], toxic: ids[2] }[k] ?? k, v]));
for (const k of ['best', 'gems', 'done', 'stars', 'attempts']) seed[k] = ren(seed[k]);

const read = () => p.evaluate(() => {
  const r = (id) => document.getElementById(id).getBoundingClientRect();
  const hit = (a, c) => a.left < c.right && c.left < a.right && a.top < c.bottom && c.top < a.bottom;
  const s = r('pstats');
  return { text: document.getElementById('pstats').innerText.replace(/\s+/g, ' ').trim(), w: Math.round(s.width), h: Math.round(s.height),
    overLogo: hit(s, document.querySelector('.logo').getBoundingClientRect()), overCards: hit(s, r('levels')), inView: s.left >= 0 && s.right <= innerWidth && s.top >= 0 };
});
// the menu pops in with a short scale animation; measure once it has settled
const settled = async () => {
  for (let i = 0; i < 100; i++) {
    if (await p.evaluate(() => { const m = document.getElementById('menu'); return !m.hidden && getComputedStyle(m).transform === 'none'; })) return;
    await sleep(200);
  }
  fail.push('the menu never settled');
};
const res = {};
for (const [name, w, h, lang] of [['phone-en', 844, 390, 'en'], ['phone-fi', 844, 390, 'fi'], ['small-fi', 667, 375, 'fi'], ['tablet-en', 1180, 820, 'en']]) {
  await p.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  await p.evaluate((s) => localStorage.setItem('neonrush.save.v1', JSON.stringify(s)), { ...seed, lang });
  await p.reload({ waitUntil: 'load' });
  await sleep(1500);
  await settled();
  const r = res[name] = await read();
  check(/5\s*\/27/.test(r.text), `${name}: stars 5/27, got "${r.text}"`);
  check(r.text.includes(' 50 '), `${name}: coins 50`);
  check(r.text.includes(' 66 '), `${name}: attempts 66 (own track included)`);
  check(!r.overLogo && !r.overCards && r.inView, `${name}: strip overlaps or leaves the screen`);
  await p.screenshot({ path: `${out}/stats-${name}.png` });
}

// finish the third track: first star there = 10 coins, one more attempt
await p.setViewport({ width: 844, height: 390, deviceScaleFactor: 2 });
await p.reload({ waitUntil: 'load' });
await sleep(1500);
await p.evaluate(() => document.querySelectorAll('#levels .card')[2].click());
await sleep(1200);
await p.evaluate(() => { const g = window.__game; g.hold = 0; const cp = g.sim.level.checkpoints.at(-1); Object.assign(g.sim.s, { z: cp.z, x: cp.x, y: 0, vy: 0, grounded: true }); });
for (let i = 0; i < 300; i++) { await sleep(100); if (await p.evaluate(() => !document.getElementById('done').hidden)) break; }
res.done = await p.evaluate(() => document.getElementById('doneStats').innerText.replace(/\s+/g, ' '));
await p.screenshot({ path: `${out}/stats-done.png` });
const got = await p.evaluate(() => window.__game.save.stars[window.__game.levels[2].def.id]);
check(got >= 1 && res.done.includes('+' + got * 10), `finish panel shows +${got * 10} coins, got "${res.done}"`);
await p.evaluate(() => document.getElementById('doneMenuBtn').click());
await sleep(300);
res.bump = await p.evaluate(() => document.getElementById('pstats').classList.contains('bump'));
await settled();
res.after = await read();
check(res.after.text.includes(` ${50 + got * 10} `), 'coins grew in the menu');
check(new RegExp(`${5 + got}\\s*/27`).test(res.after.text), 'stars grew in the menu');
check(res.bump, 'numbers pop when stars have grown');
const tries = +res.after.text.match(/(\d+) \S+$/)[1];
check(tries > 66, `attempts grew (${tries})`);
check(await p.evaluate(() => JSON.parse(localStorage.getItem('neonrush.save.v1')).attempts[window.__game.levels[2].def.id]) > 9, 'attempts are stored');
await p.screenshot({ path: `${out}/stats-after.png` });
console.log(JSON.stringify(res, null, 1));
console.log(fail.length || errs.length ? 'FAIL ' + JSON.stringify([...fail, ...errs]) : 'OK');
await b.close();
process.exit(fail.length || errs.length ? 1 : 0);
