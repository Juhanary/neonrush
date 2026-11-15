// A music file as the music of a custom track: does the file stay on the ship's beat position?
// Builds a 132 BPM click song in the page, analyses it, stores a plain 16-bar track with it and lets the
// ship drive. Reports the analysed tempo and, twice a second, how far the file is from where the ship
// says it should be (seconds, positive = ahead), plus the playback rate. A tiny viewport, so that software
// rendering reaches a real frame rate.
//   node scripts/tracksync.mjs http://localhost:4173/
import puppeteer from 'puppeteer-core';
const [url] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage();
await p.setViewport({ width: 240, height: 120, deviceScaleFactor: 1 });
const errs = [];
p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errs.push(m.text()); });
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await p.goto(url + '?debug', { waitUntil: 'load' });
await sleep(2000);
await p.mouse.click(3, 3);
await sleep(300);
const res = {};
res.music = await p.evaluate(async () => {
  const g = window.__game, ctx = g.audio.ctx, sr = ctx.sampleRate, BPM = 132, OFFSET = 0.3, SECS = 40;
  const buf = ctx.createBuffer(1, sr * SECS, sr), d = buf.getChannelData(0);
  for (let k = 0; OFFSET + (k * 60) / BPM < SECS - 0.2; k++) {
    const a = Math.round((OFFSET + (k * 60) / BPM) * sr);
    for (let i = 0; i < sr * 0.15; i++) { const u = i / sr; d[a + i] += 0.8 * Math.sin(2 * Math.PI * (55 * u + 2 * (1 - Math.exp(-u * 30)))) * Math.exp(-u * 20); }
    if (k % 4 === 0) for (let i = 0; i < sr * 0.03; i++) d[a + i] += 0.3 * Math.sin(2 * Math.PI * 1760 * i / sr);
  }
  const { music } = window.__analyse(d, sr, 'click');
  const id = 'synctest';
  g.store.put({ v: 1, id, name: 'SYNC', world: 2, speed: music.bpm / 5, song: 'toxic', rows: Array(192).fill('====='), flipBars: [], music, updated: 0 });
  g.tracks.set(id, buf);
  await g.playCustom(id);
  return { bpm: music.bpm, t0: music.t0, first: music.first, mode: g.mode };
});
res.samples = [];
for (let i = 0; i < 16; i++) {
  await sleep(500);
  res.samples.push(await p.evaluate(() => { const g = window.__game, a = g.audio; return [+g.lvl.beatAt(g.sim.s.z).toFixed(2), +a.trackError.toFixed(4), +a.srcRate.toFixed(4), a.src ? 1 : 0]; }));
}
res.restarts = await p.evaluate(() => window.__game.attempts);
await p.evaluate(() => { window.__game.store.remove('synctest'); });
console.log(JSON.stringify(res), errs);
await b.close();
