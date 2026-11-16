import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage();
await p.setViewport({ width: 844, height: 390 });
const errs = [];
p.on('pageerror', (e) => errs.push('pageerror ' + e.message));
p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errs.push(m.text()); });
await p.goto(process.argv[2] + '?debug', { waitUntil: 'load' });
await sleep(2500);
const out = process.argv[3];
await p.screenshot({ path: `${out}/menu5.png` });
// freeze the game at a given row and render a few frames there
const at = async (lvl, find, name, y = 0, back = 3) => {
  await p.evaluate((i) => { const g = window.__game; g.toMenu(); document.querySelectorAll('.card')[i].click(); }, lvl);
  await sleep(600);
  const info = await p.evaluate(({ find, y, back }) => {
    const g = window.__game; const L = g.sim.level;
    const row = typeof find === 'number' ? find : L.rows.indexOf(find);
    g.mode = 'pause';
    Object.assign(g.sim.s, { z: (row - back) * 4, x: 0, y, vy: 0, grounded: y === 0, time: 3.3, flip: L.inFlip((row - back) * 4) });
    g.prev = { ...g.sim.s };
    for (let i = 0; i < 40; i++) g.view.frame(1 / 60, g.pose(1), 5 + i / 60, 0.4, false);
    g.ui.setFlip(g.sim.s.flip, 0);
    return { row, flip: g.sim.s.flip, style: g.audio.song.style };
  }, { find, y, back });
  await p.screenshot({ path: `${out}/${name}.png` });
  return info;
};
const res = [];
res.push(await at(3, 'ii#ii', 'ice'));
res.push(await at(3, '.mmm.', 'moving', 0, 2));
res.push(await at(4, '.|.|.', 'rail', 0, 4));
res.push(await at(4, 80, 'flip', 3, 0));
// let the flip zone run live for a moment to exercise events and audio
await p.evaluate(() => { const g = window.__game; g.mode = 'play'; });
for (let i = 0; i < 6; i++) { await p.keyboard.press('Space'); await sleep(150); }
res.push(await p.evaluate(() => { const g = window.__game; return { mode: g.mode, flip: g.sim.s.flip, y: +g.sim.s.y.toFixed(1), tap: document.getElementById('tap').className, banner: document.getElementById('banner').textContent }; }));
console.log(res.map((r) => JSON.stringify(r)).join('\n'), errs);
await b.close();
