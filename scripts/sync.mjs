// Checks that the music really follows the ship: the menu theme runs, and on a track every sixteenth is
// scheduled for the moment the ship reaches that position (3 m per sixteenth at any speed).
//   node scripts/sync.mjs http://localhost:4173/ [outDir]
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
await p.mouse.click(120, 5);            // any touch unlocks audio and starts the menu theme
await p.evaluate(() => { window.__game.audio.log = []; });
await sleep(1500);
res.menu = await p.evaluate(() => { const a = window.__game.audio; return { song: a.current, state: a.ctx.state, steps: a.log.length }; });
for (const level of [0, 7]) {
  await p.evaluate(() => { const g = window.__game; if (g.mode !== 'menu') g.toMenu(); });
  await sleep(300);
  await p.evaluate((i) => { document.querySelectorAll('.card')[i].click(); window.__game.audio.log = []; }, level);
  await sleep(2600);
  if (out) await p.screenshot({ path: `${out}/beatlines-${level}.png` });
  res['level' + level] = await p.evaluate(() => {
    const g = window.__game, a = g.audio, log = a.log.slice();
    const sd = 1 / (a.bps * 4);
    // where the ship will be when each scheduled step sounds, measured against the grid (3 m per step, from z = 2)
    const now = a.ctx.currentTime, z = g.sim.s.z, v = g.sim.s.speed;
    const off = log.map(([step, t]) => (z + (t - now) * v) - (2 + step * 3));
    const gaps = log.slice(1).map((e, i) => e[1] - log[i][1]);
    return { song: a.current, bpm: +(a.bps * 60).toFixed(1), steps: log.length, first: log[0]?.[0],
      stepMs: +(sd * 1000).toFixed(1), maxGapErrMs: +(Math.max(...gaps.map((d) => Math.abs(d - sd))) * 1000).toFixed(2),
      maxPosErrM: +Math.max(...off.slice(-8).map(Math.abs)).toFixed(2), mode: g.mode, fps: Math.round(1 / a.frame) };
  });
}
console.log(JSON.stringify(res, null, 1), errs);
await b.close();
