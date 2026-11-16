// Screenshot of the level menu (scrolled to the end): node scripts/menu.mjs URL OUT
import puppeteer from 'puppeteer-core';
const [url, out] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage();
await p.setViewport({ width: 844, height: 390, deviceScaleFactor: 2 });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto(url + '?debug', { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 2500));
await p.evaluate(() => { const l = document.getElementById('levels'); l.scrollTop = l.scrollHeight; });
await new Promise((r) => setTimeout(r, 300));
await p.screenshot({ path: `${out}/menu-end.png` });
console.log('ok', errs);
await b.close();
