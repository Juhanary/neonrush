import puppeteer from 'puppeteer-core';
const url = process.argv[2], out = process.argv[3], level = +(process.argv[4] ?? 0);
const W = +(process.argv[5] ?? 844), H = +(process.argv[6] ?? 390);
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', `--window-size=${W},${H}`] });
const p = await b.newPage();
await p.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
const errs = [];
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warn') errs.push(m.type() + ': ' + m.text()); });
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await p.goto(url, { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 4000));
await p.screenshot({ path: `${out}/menu-${W}.png` });
await p.evaluate((i) => document.querySelectorAll('.card')[i].click(), level);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// crude autopilot: jump periodically, take frames
for (let i = 0; i < 6; i++) {
  await sleep(900);
  await p.keyboard.press('Space');
  await sleep(250);
  await p.screenshot({ path: `${out}/play-${level}-${i}.png` });
}
const info = await p.evaluate(() => ({ pct: document.getElementById('pct').textContent, attempt: document.getElementById('attempt').textContent, fatal: document.getElementById('fatal').hidden }));
console.log(JSON.stringify(info), errs.slice(0, 12));
await b.close();
