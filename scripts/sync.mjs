// Live smoke test of the music: the first touch starts the menu theme, a track switches to its own song
// at its own tempo, and sixteenths keep being scheduled with no errors. Exact timing is proven by
// tests/clock.test.ts; software rendering here is too slow to measure it.
//   node scripts/sync.mjs http://localhost:4173/
import puppeteer from 'puppeteer-core';
const [url, out] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage();
await p.setViewport({ width: 240, height: 120, deviceScaleFactor: 1 }); // tiny: software GL must reach a real frame rate for the timing to mean anything
const errs = [];
p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errs.push(m.text()); });
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await p.goto(url + '?debug', { waitUntil: 'load' });
await sleep(2000);
const res = {};
await p.mouse.click(3, 3);            // any touch unlocks audio and starts the menu theme
await p.evaluate(() => { window.__game.audio.log = []; });
await sleep(1500);
res.menu = await p.evaluate(() => { const a = window.__game.audio; return { song: a.current, state: a.ctx.state, steps: a.log.length }; });
for (const level of [0, 7]) {
  await p.evaluate(() => { const g = window.__game; if (g.mode !== 'menu') g.toMenu(); });
  await sleep(300);
  await p.evaluate((i) => { document.querySelectorAll('.card')[i].click(); window.__game.audio.log = []; }, level);
  await sleep(1000);
  res['level' + level] = await p.evaluate(() => {
    const g = window.__game, a = g.audio;
    return { song: a.current, bpm: +(a.clock.bps * 60).toFixed(1), steps: a.log.length, mode: g.mode };
  });
}
console.log(JSON.stringify(res, null, 1), errs);
await b.close();
