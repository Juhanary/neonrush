// Renders every song offline at each energy level and reports loudness and balance.
// Nobody can listen in CI, so this at least catches clipping, silence and a lopsided mix.
//   node scripts/audio.mjs http://localhost:4173/
import puppeteer from 'puppeteer-core';
const url = process.argv[2];
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'], protocolTimeout: 240000 });
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto(url + '?debug', { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 1500));
const tempos = { menu: 112, cyan: 120, solar: 130, toxic: 140, frost: 145, gravity: 150, ember: 155, volt: 160, zero: 165, horizon: 170,
  drift: 120, flare: 130, pulse: 140, line: 145, well: 150, rush: 155, storm: 160, point: 165, neon: 170 };
await p.evaluate(() => { window.__game.mode = 'pause'; }); // stop drawing: software GL would starve the render
// every built-in song, plus one generated song per mood (any `gen:<seed>[:<mood>]` name can be passed as the third argument)
const names = process.argv[3] ? process.argv[3].split(',') : [...(await p.evaluate(() => Object.keys(window.__songs))), 'gen:1:chase', 'gen:2:night', 'gen:3:cold'];
const rows = [];
for (const name of names) {
  for (const energy of [1, 2, 3]) rows.push({ song: name, energy, ...(await p.evaluate((n, e, bpm) => window.__audio.render(n, 4, e, bpm), name, energy, tempos[name] ?? 140)) });
}
let bad = 0;
for (const r of rows) {
  const problems = [];
  if (r.clipped > 0 || r.peak >= 0.999) problems.push('CLIPS');
  if (r.rms < -30) problems.push('TOO QUIET');
  if (r.rms > -9) problems.push('TOO LOUD');
  if (r.low - r.mid > 5.5) problems.push('BASS HEAVY');
  if (r.mid - r.low > 14) problems.push('NO BASS');
  if (r.high < r.mid - 26) problems.push('DULL');
  if (problems.length) bad++;
  console.log(`${r.song.padEnd(13)} e${r.energy}  peak ${r.peak.toFixed(3)}  rms ${String(r.rms).padStart(6)} dB  low ${String(r.low).padStart(6)}  mid ${String(r.mid).padStart(6)}  high ${String(r.high).padStart(6)}  ${problems.join(' ')}`);
}
console.log(bad ? `${bad} problem(s)` : 'all songs within range', errs);
await b.close();
process.exit(bad || errs.length ? 1 : 0);
