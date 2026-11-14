// Close-up of the ship on a given track (paused), to judge the craft itself.
import puppeteer from 'puppeteer-core';
const url = process.argv[2], out = process.argv[3], level = +(process.argv[4] ?? 0);
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage();
await p.setViewport({ width: 844, height: 390, deviceScaleFactor: 4 });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto(url + '?debug', { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 2500));
await p.evaluate((i) => document.querySelectorAll('.card')[i].click(), level);
await new Promise((r) => setTimeout(r, 900));
await p.evaluate(() => { window.__game.mode = 'pause'; });
await new Promise((r) => setTimeout(r, 200));
await p.screenshot({ path: `${out}/ship-${level}.png`, clip: { x: 342, y: 240, width: 160, height: 90 } });

console.log('ok', errs);
await b.close();
