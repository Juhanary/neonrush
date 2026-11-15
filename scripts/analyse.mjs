// The music analysis on real mixes: every built-in song is rendered offline at its track's tempo (full
// arrangement: drums, bass, pads, arpeggios, leads; quiet intro bars, loud later ones) and then analysed
// as if it were a file the player picked. Reports found tempo, error of the first beat and the bar grades.
//   node scripts/analyse.mjs http://localhost:4173/ [indexes, e.g. 0,4,8]   (offline rendering is slow: about 20 s a song here)
import puppeteer from 'puppeteer-core';
const [url] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', protocolTimeout: 600000,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage();
await p.setViewport({ width: 240, height: 120, deviceScaleFactor: 1 });
const errs = [];
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await p.goto(url + '?debug', { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 1500));
const jobs = (await p.evaluate(() => window.__game.levels.map((l) => [l.def.song, l.bpm]))).concat([['menu', 112], ['cyan', 128.4], ['volt', 96], ['toxic', 187]])
  .filter((_, i) => !process.argv[3] || process.argv[3].split(',').includes(String(i)));
await p.evaluate(() => { window.__game.mode = 'edit'; }); // stop drawing: all the time goes to rendering audio
const rows = [];
for (const [song, bpm] of jobs) {
  const t0 = Date.now();
  rows.push(await p.evaluate(async (song, bpm) => {
    // bars 0-3 quiet, 4-7 medium, 8-15 loud
    const buf = await window.__audio.renderSong(song, 16, (bar) => (bar < 4 ? 1 : bar < 8 ? 2 : 3), bpm);
    const L = buf.getChannelData(0), R = buf.getChannelData(1), mono = new Float32Array(L.length);
    for (let i = 0; i < L.length; i++) mono[i] = (L[i] + R[i]) / 2;
    const t = performance.now();
    const { music, confidence } = window.__analyse(mono, buf.sampleRate, song);
    const ms = Math.round(performance.now() - t);
    const beat = 60 / music.bpm;
    const k = (music.t0 + music.first * beat - 0.05) / (60 / bpm);
    return { song, bpm, found: music.bpm, beatErrMs: (((music.t0 - 0.05) % beat + beat * 1.5) % beat - beat / 2) * 1000, startsOnBeat: +k.toFixed(2), conf: +confidence.toFixed(2), ms, secs: Math.round(buf.duration) };
  }, song, bpm));
  console.error(song, 'rendered and analysed in', Math.round((Date.now() - t0) / 1000), 's');
}
let bad = 0;
for (const r of rows) {
  // the mix bus delays the rendered song by 12 ms (compressor and limiter look-ahead), so that is where the beat should be found
  const truth = r.bpm < 95 ? r.bpm * 2 : r.bpm;
  const ok = Math.abs(r.found - truth) < 0.05 && Math.abs(r.beatErrMs - 12) < 8;
  if (!ok) bad++;
  console.log(`${r.song.padEnd(8)} ${String(r.bpm).padStart(6)} BPM  found ${String(r.found).padStart(7)}  beat error ${String(r.beatErrMs.toFixed(1)).padStart(6)} ms  track starts on beat ${(((Math.round(r.startsOnBeat) % 4) + 4) % 4) + 1} of a bar  confidence ${r.conf}  ${r.ms} ms for ${r.secs} s  ${ok ? 'ok' : 'OFF'}`);
}
console.log(bad ? `${bad} off` : 'all tempos and beats found', errs);
await b.close();
