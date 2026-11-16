import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage();
await p.setViewport({ width: 844, height: 390 });
const errs = [];
p.on('pageerror', (e) => errs.push('pageerror ' + e.message));
p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errs.push(m.text()); });
await p.evaluateOnNewDocument(() => { try { localStorage.setItem('neonrush.save.v1', JSON.stringify({ best: { 'cyan-drift': 30, 'solar-flare': 30, 'toxic-pulse': 30 } })); } catch {} });
await p.goto(process.argv[2] + '?debug', { waitUntil: 'load' });
await sleep(2500);
const out = process.argv[3];
const res = [];
for (const lvl of [0, 1, 2]) {
  await p.evaluate((i) => { window.__game.toMenu(); document.querySelectorAll('.card')[i].click(); }, lvl);
  await sleep(1500);
  // place the ship on a clear stretch just before 50 % and hold it on the road by flying high
  const info = await p.evaluate(() => {
    const g = window.__game; const L = g.sim.level;
    g.sim.s.z = L.finishZ * 0.49; g.sim.s.y = 40; g.sim.s.vy = 0; g.sim.s.grounded = false; g.sim.s.x = 0;
    return { ctx: g.audio.ctx?.state, style: g.audio.song.style, step: g.audio.stepDur };
  });
  await sleep(1400);
  const st = await p.evaluate(() => { const g = window.__game; g.sim.s.y = 40; g.sim.s.vy = 0; return { hype: g.hype, banner: document.getElementById('banner').textContent, bar: document.getElementById('bar').className, steps: g.audio.step }; });
  await p.screenshot({ path: `${out}/hype-${lvl}.png` });
  res.push({ lvl, ...info, ...st });
}
// death with a new best
await p.evaluate(() => { const g = window.__game; g.sim.s.y = -4.9; g.sim.s.vy = -5; });
await sleep(700);
res.push(await p.evaluate(() => ({ mode: window.__game.mode, banner: document.getElementById('banner').textContent, cls: document.getElementById('banner').className })));
await p.screenshot({ path: `${out}/newbest.png` });
console.log(res.map((r) => JSON.stringify(r)).join('\n'), errs);
await b.close();
