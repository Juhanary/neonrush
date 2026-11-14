// Headless smoke test of the real page: touch steering, jump, death + auto-restart, finish panel, portrait layout.
import puppeteer from 'puppeteer-core';
const url = process.argv[2], out = process.argv[3];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage();
await p.emulate({ viewport: { width: 844, height: 390, deviceScaleFactor: 1, isMobile: true, hasTouch: true, isLandscape: true }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' });
const errs = [];
p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errs.push(m.text()); });
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await p.goto(url + '?debug', { waitUntil: 'load' });
await sleep(2500);
const st = () => p.evaluate(() => { const g = window.__game; return { mode: g.mode, x: +g.sim.s.x.toFixed(2), y: +g.sim.s.y.toFixed(2), z: +g.sim.s.z.toFixed(1), attempts: g.attempts, gems: g.sim.collected.size }; });
const res = {};
await p.touchscreen.tap(190, 220);                 // first level card
await sleep(600);
res.started = await st();
// steer right with a drag on the left half
await p.touchscreen.touchStart(150, 300);
await p.touchscreen.touchMove(200, 300);
await sleep(350);
res.steered = await st();
await p.touchscreen.touchEnd();
await sleep(200);
res.released = await st();
// jump with a tap on the right half
await p.touchscreen.tap(700, 300);
await sleep(180);
res.jumped = await st();
// wait for death in the first gap, capture the explosion, then the auto-restart
let died = false;
for (let i = 0; i < 60 && !died; i++) { await sleep(50); died = (await st()).mode === 'dead'; }
await sleep(120);
await p.screenshot({ path: `${out}/death.png` });
res.died = await st();
for (let i = 0; i < 60; i++) { await sleep(100); const q = await st(); if (q.mode === 'play' && q.attempts >= 2) break; }
res.respawned = await st();
// jump to just before the finish line
await p.evaluate(() => { const g = window.__game; g.sim.s.z = g.sim.level.finishZ - 30; g.sim.s.x = 0; g.sim.s.y = 0; g.sim.s.vy = 0; g.sim.s.grounded = true; });
await sleep(700);
await p.screenshot({ path: `${out}/portal.png` });
for (let i = 0; i < 80; i++) { await sleep(100); if (await p.evaluate(() => !document.getElementById('done').hidden)) break; }
res.finished = await st();
res.fps = await p.evaluate(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 > 1000) r(n); else requestAnimationFrame(f); }; f(); }));
res.donePanel = await p.evaluate(() => !document.getElementById('done').hidden && document.getElementById('doneStats').textContent);
await p.screenshot({ path: `${out}/done.png` });
// portrait
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await p.evaluate(() => document.getElementById('againBtn').click());
await sleep(1500);
await p.screenshot({ path: `${out}/portrait.png` });
console.log(JSON.stringify(res, null, 1), errs);
await b.close();
