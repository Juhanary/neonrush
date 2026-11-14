import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage();
await p.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 });
await p.goto(process.argv[2] + '?debug', { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 3000));
await p.evaluate(() => document.querySelector('.card').click());
await new Promise((r) => setTimeout(r, 500));
const out = [];
for (let k = 0; k < 3; k++) {
  await p.evaluate(() => { const g = window.__game; if (g.mode !== 'play') g.respawn(); });
  out.push(await p.evaluate(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 > 1500) r(Math.round(n / 1.5)); else requestAnimationFrame(f); }; f(); })));
}
console.log(out.join(' '));
await b.close();
