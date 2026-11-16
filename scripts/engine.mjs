// Close-up of the ship's engines during a real run (no teleport), for judging exhaust effects:
//   node scripts/engine.mjs URL OUT [level] [ms]
import puppeteer from 'puppeteer-core';
const [url, out, level = '0', ms = '1500'] = process.argv.slice(2);
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage();
await p.setViewport({ width: 844, height: 390, deviceScaleFactor: 2 });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto(url + '?debug', { waitUntil: 'load' });
await sleep(2500);
await p.evaluate((i) => document.querySelectorAll('.card')[i].click(), +level);
await sleep(+ms);
await p.screenshot({ path: `${out}/engine-${level}.png`, clip: { x: 300, y: 225, width: 244, height: 165 } });
await p.screenshot({ path: `${out}/engine-${level}-wide.png` });
console.log('ok', errs);
await b.close();
