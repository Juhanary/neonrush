// Teleports the ship to given rows of a track and takes a frame at each: node scripts/tour.mjs URL OUT LEVEL "row[:x[:y]] ..." [practice]
import puppeteer from 'puppeteer-core';
const [url, out, level, rows, practice] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage();
await p.setViewport({ width: 844, height: 390, deviceScaleFactor: 2 });
const errs = [];
p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errs.push(m.text()); });
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await p.goto(url + '?debug', { waitUntil: 'load' });
await sleep(2500);
if (practice) await p.evaluate(() => document.getElementById('modeBtn').click());
await p.evaluate((i) => document.querySelectorAll('.card')[i].click(), +level);
await sleep(700);
for (const spec of rows.split(' ')) {
  const [row, x = 0, y = 0] = spec.split(':').map(Number);
  await p.evaluate((row, x, y) => {
    const g = window.__game;
    if (g.mode !== 'play') g.respawn();
    g.hold = 0;
    Object.assign(g.sim.s, { z: row * 4, x, y, vy: 0, vx: 0, grounded: y === 0, alive: true });
    g.prev = { ...g.sim.s };
  }, row, x, y);
  await sleep(260);
  // the close-up first: a moment later the ship may already have hit what is ahead
  if (process.env.CROP) await p.screenshot({ path: `${out}/tourcrop-${level}-${row}.png`, clip: { x: 322, y: 245, width: 200, height: 110 } });
  await p.screenshot({ path: `${out}/tour-${level}-${row}.png` });
}
console.log('ok', errs);
await b.close();
