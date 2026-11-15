// Practice mode end to end: toggle, checkpoints reached, restart from checkpoint, step back, persistence, finish.
import puppeteer from 'puppeteer-core';
const [url, out] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage();
await p.emulate({ viewport: { width: 844, height: 390, deviceScaleFactor: 1, isMobile: true, hasTouch: true, isLandscape: true }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' });
const errs = [];
p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errs.push(m.text()); });
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await p.goto(url + '?debug', { waitUntil: 'load' });
await sleep(2500);
const st = () => p.evaluate(() => { const g = window.__game; return { mode: g.mode, practice: g.practice, cp: g.cp, row: +(g.sim.s.z / 4).toFixed(1), hold: g.hold > 0, attempts: g.attempts, save: JSON.parse(localStorage.getItem('neonrush.save.v1') || '{}') }; });
const brief = (s) => ({ mode: s.mode, practice: s.practice, cp: s.cp, row: s.row, hold: s.hold, saved: s.save.practice, best: s.save.best, done: s.save.done });
const res = {};
await p.screenshot({ path: `${out}/menu.png` });
await p.tap('#guideBtn'); await sleep(400);
await p.screenshot({ path: `${out}/guide.png` });
res.guideItems = await p.evaluate(() => document.querySelectorAll('#guideList div').length);
await p.tap('#guideBack'); await sleep(300);
await p.tap('#modeBtn'); await sleep(300);
await p.screenshot({ path: `${out}/menu-practice.png` });
await p.evaluate(() => document.querySelectorAll('.card')[0].click());
await sleep(500);
res.started = brief(await st());
// no input: the ship passes two checkpoints and falls into the first gap, then restarts from the last checkpoint
let s;
for (let i = 0; i < 300; i++) { await sleep(50); s = await st(); if (s.mode === 'dead') break; }
res.died = brief(s);
for (let i = 0; i < 80; i++) { await sleep(50); s = await st(); if (s.mode === 'play' && s.attempts >= 2) break; }
res.respawned = brief(s);
await p.screenshot({ path: `${out}/practice-ready.png` });
await p.tap('#cpBackBtn'); await sleep(150);
res.back = brief(await st());
await p.tap('#cpStartBtn'); await sleep(150);
res.fromStart = brief(await st());
// let it run to the gap again, then reload: practice mode and the checkpoint must survive
for (let i = 0; i < 300; i++) { await sleep(50); s = await st(); if (s.mode === 'dead') break; }
await p.reload({ waitUntil: 'load' }); await sleep(2500);
await p.evaluate(() => document.querySelectorAll('.card')[0].click());
await sleep(300);
res.afterReload = brief(await st());
// finish in practice: nothing is recorded
await p.evaluate(() => { const g = window.__game; g.hold = 0; const cp = g.sim.level.checkpoints.at(-1); Object.assign(g.sim.s, { z: cp.z, x: cp.x, y: 0, vy: 0, grounded: true }); }); // last checkpoint: a straight run to the finish
for (let i = 0; i < 200; i++) { await sleep(100); if (await p.evaluate(() => !document.getElementById('done').hidden)) break; }
await p.screenshot({ path: `${out}/practice-done.png` });
res.finished = brief(await st());
res.doneTitle = await p.evaluate(() => document.getElementById('doneTitle').textContent);
// "play for real" switches practice off
await p.tap('#againBtn'); await sleep(400);
res.real = brief(await st());
console.log(JSON.stringify(res), errs);
await b.close();
