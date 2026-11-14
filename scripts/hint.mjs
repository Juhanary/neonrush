import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage();
await p.setViewport({ width: 844, height: 390 });
await p.goto(process.argv[2] + '?debug', { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 2500));
await p.evaluate(() => document.querySelectorAll('.card')[0].click());
await new Promise((r) => setTimeout(r, 300));
// drop the ship just before the jump pad and let it fly with no input
const padRow = await p.evaluate(() => { const g = window.__game; const r = g.sim.level.rows.indexOf('^^^^^'); Object.assign(g.sim.s, { z: (r - 5) * 4, x: 0, y: 0, vy: 0, grounded: true }); g.nextHint = 99; g.ui.showCallout('KELTAINEN ALUSTA HEITTÄÄ ILMAAN'); return r; });
await new Promise((r) => setTimeout(r, 500));
await p.screenshot({ path: process.argv[3] + '/hint.png' });
let st;
for (let i = 0; i < 80; i++) { await new Promise((r) => setTimeout(r, 100)); st = await p.evaluate(() => { const g = window.__game; return { mode: g.mode, row: +(g.sim.s.z / 4).toFixed(1), y: +g.sim.s.y.toFixed(1), gems: g.sim.collected.size, attempts: g.attempts }; }); if (st.row > padRow + 8 || st.attempts > 1) break; }
console.log(padRow, JSON.stringify(st));
await b.close();
