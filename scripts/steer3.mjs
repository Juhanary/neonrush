import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage();
await p.emulate({ viewport: { width: 844, height: 390, deviceScaleFactor: 1, isMobile: true, hasTouch: true, isLandscape: true }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' });
await p.goto(process.argv[2] + '?debug', { waitUntil: 'load' });
await sleep(2500);
const st = () => p.evaluate(() => { const g = window.__game; return { mode: g.mode, idx: g.idx, x: +g.sim.s.x.toFixed(2), vx: +g.sim.s.vx.toFixed(1), steerId: g.input.steerId, touchSteer: g.input.touchSteer }; });
const out = [];
for (const lvl of [0, 2]) {
  await p.evaluate(() => window.__game.toMenu());
  await sleep(300);
  const box = await p.evaluate((i) => { const r = document.querySelectorAll('.card')[i].getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, lvl);
  await p.touchscreen.tap(box[0], box[1]);
  await sleep(400);
  await p.touchscreen.touchStart(150, 300);
  await p.touchscreen.touchMove(120, 300);
  await sleep(150);
  out.push({ lvl, ...(await st()) });
  await p.touchscreen.touchEnd();
  await sleep(100);
  out.push({ lvl, after: 1, ...(await st()) });
}
console.log(out.map((o) => JSON.stringify(o)).join('\n'));
await b.close();
