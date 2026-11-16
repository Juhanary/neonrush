// Headless run through the level editor: new track, sections, painted tiles, an air block, a flip zone, a music file (a synthetic
// 128 BPM song written here as a WAV), the bot check, a test drive with the file as music,
// back to the editor, the menu card, and the same track after a reload.
//   node scripts/editor.mjs http://localhost:4173/ /tmp/shots
import { writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
const [url, out] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- a song with a known tempo: kick on every beat, snare on 2 and 4, a bass note per bar, quiet bars 8..11
const SR = 44100, BPM = 128, OFFSET = 0.25, SECS = 46;
const pcm = new Float32Array(SR * SECS);
let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const add = (t, dur, f) => { const a = Math.round(t * SR), n = Math.floor(dur * SR); for (let i = 0; i < n && a + i < pcm.length; i++) pcm[a + i] += f(i / SR); };
for (let k = 0; OFFSET + (k * 60) / BPM < SECS; k++) {
  const t = OFFSET + (k * 60) / BPM, bar = Math.floor(k / 4), quiet = bar >= 8 && bar < 12;
  if (!quiet) add(t, 0.18, (u) => 0.7 * Math.sin(2 * Math.PI * (50 * u + 2 * (1 - Math.exp(-u * 30)))) * Math.exp(-u * 18));
  if (!quiet && k % 2) add(t, 0.12, (u) => 0.35 * rnd() * Math.exp(-u * 30));
  if (!quiet) add(t + 30 / BPM, 0.04, (u) => 0.12 * rnd() * Math.exp(-u * 90));
  if (k % 4 === 0) { const f = [110, 130.8, 146.8, 98][bar % 4]; add(t, 1.8, (u) => (quiet ? 0.06 : 0.2) * Math.sin(2 * Math.PI * f * u) * Math.min(1, u * 200)); }
}
const wav = Buffer.alloc(44 + pcm.length * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + pcm.length * 2, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(pcm.length * 2, 40);
for (let i = 0; i < pcm.length; i++) wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, pcm[i])) * 32767), 44 + i * 2);
const wavPath = `${out}/editor-song-128.wav`;
writeFileSync(wavPath, wav);

const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage();
await p.emulate({ viewport: { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' });
const errs = [];
p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errs.push(m.text()); });
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await p.goto(url + '?debug', { waitUntil: 'load' });
await sleep(2500);
const res = {};
const ed = (fn) => p.evaluate(fn);
const status = () => p.$eval('#edStatus', (e) => e.textContent);
const waitStatus = async (re, ms = 60000) => { for (let t = 0; t < ms; t += 250) { if (re.test(await status())) return true; await sleep(250); } return false; };
const grid = async () => { const r = await p.$eval('#edGrid', (e) => { const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; }); return r; };
// centre of the cell (row, lane) on screen
const cell = async (row, lane) => {
  const g = await grid();
  const s = await ed(() => { const e = window.__game.editor; return { cw: e.cw, scroll: e.scroll }; });
  return { x: g.x + (row + 0.5) * s.cw - s.scroll, y: g.y + 30 + (lane + 0.5) * ((g.h - 30 - 34 - 6) / 5) };
};
const pick = (label) => p.evaluate((label) => { const b = [...document.querySelectorAll('#edPalette button')].find((x) => x.querySelector('span').textContent === label); b?.click(); return !!b; }, label);

// 1. new track
await p.tap('#newTrack');
await sleep(500);
res.open = await ed(() => ({ mode: window.__game.mode, visible: !document.getElementById('editor').hidden, menuHidden: document.getElementById('menu').hidden }));
await p.screenshot({ path: `${out}/editor-1-new.png` });

// a new track is one section; add a second one with the button after the finish line
res.barsAtStart = await ed(() => window.__game.editor.lv.rows.length / 12);
await ed(() => window.__game.editor.addSection());
await sleep(300);
await p.screenshot({ path: `${out}/editor-1c-section.png` });
res.barsAfterAdd = await ed(() => window.__game.editor.lv.rows.length / 12);
await ed(() => { const e = window.__game.editor; e.setBars(16); e.scrollTo(-20); });
await sleep(200);
// 2. single tiles: a gap two columns long painted with a drag, a wall of blocks, an air block, a short flip zone
res.pickGap = await pick('GAP');
{ const a = await cell(7, 0), z = await cell(8, 4), m = await cell(7, 4), n = await cell(8, 0);
  await p.touchscreen.touchStart(a.x, a.y); await p.touchscreen.touchMove(m.x, m.y); await p.touchscreen.touchMove(n.x, n.y); await p.touchscreen.touchMove(z.x, z.y); await p.touchscreen.touchEnd(); }
await sleep(200);
res.pickAir = await pick('AIR BLOCK');
let c = await cell(20, 2);
await p.touchscreen.tap(c.x, c.y);
res.pickFlip = await pick('FLIP ZONE');
{ const a = await cell(22, 2), z = await cell(23, 2);
  await p.touchscreen.touchStart(a.x, a.y); await p.touchscreen.touchMove(z.x, z.y); await p.touchscreen.touchEnd(); }
await sleep(200);
res.flips = await ed(() => window.__game.editor.level.def.flips);
res.pickBlock = await pick('BLOCK');
const a = await cell(15, 0), z = await cell(15, 2);
await p.touchscreen.touchStart(a.x, a.y); await p.touchscreen.touchMove((a.x + z.x) / 2, (a.y + z.y) / 2); await p.touchscreen.touchMove(z.x, z.y); await p.touchscreen.touchEnd();
await sleep(200);
res.rows = await ed(() => window.__game.editor.lv.rows.slice(0, 28).join(' '));
// a gem off the beat row shows a rule hint
await pick('GEM');
c = await cell(19, 2); await p.touchscreen.tap(c.x, c.y);
await sleep(200);
res.hint = await status();
await p.screenshot({ path: `${out}/editor-2-built.png` });
await p.tap('#edUndo'); await sleep(150);
res.afterUndo = await status();

// 2b. one gem tool with three heights; a column holds one gem; the check names a gem that cannot be had
c = await cell(12, 2); await p.touchscreen.tap(c.x, c.y);                 // LOW on a beat row
res.gemButtons = await p.$$eval('#edPalette button', (bs) => bs.map((x) => x.querySelector('span').textContent + (x.classList.contains('on') ? '*' : '')).join(' '));
res.pickMid = await pick('MID');
c = await cell(7, 2); await p.touchscreen.tap(c.x, c.y);                  // MID over the gap: the gap stays
c = await cell(18, 1); await p.touchscreen.tap(c.x, c.y);
res.pickHigh = await pick('HIGH');
c = await cell(18, 3); await p.touchscreen.tap(c.x, c.y);                 // same column: the gem moves here, at the new height
await ed(() => window.__game.editor.center(36)); await sleep(200);
c = await cell(36, 2); await p.touchscreen.tap(c.x, c.y);                 // nothing to climb here: out of reach
await sleep(200);
res.gemRows = await ed(() => { const r = window.__game.editor.lv.rows; return [7, 12, 18, 36].map((i) => i + ':' + r[i]).join(' '); });
res.gemHelp = await status();
await p.screenshot({ path: `${out}/editor-2b-gems.png` });
await p.tap('#edCheck');
await sleep(400);
await waitStatus(/^[✓✖⚠]/);
res.gemCheck = await status();
res.gemMissed = await ed(() => window.__game.editor.missGem);
await sleep(200);
await p.screenshot({ path: `${out}/editor-2c-gem-missed.png` });
c = await cell(36, 2); await p.touchscreen.tap(c.x, c.y);                 // tapping a gem with its own height takes it away
await sleep(200);
res.gemGone = await ed(() => window.__game.editor.lv.rows[36]);
await p.tap('#edCheck');
await sleep(400);
await waitStatus(/^[✓✖⚠]/);
res.gemCheck2 = await status();
await ed(() => window.__game.editor.scrollTo(-20));
await sleep(200);

// 3. music: the file is analysed and sets tempo, speed and length
await p.tap('#edSet');
await sleep(200);
await p.screenshot({ path: `${out}/editor-3-panel.png` });
// game music: a generated song in a mood, auditioned at the track's tempo, then a built-in one
await p.evaluate(() => document.querySelector('[data-mood="night"]').click());
await sleep(1500);
res.generated = await ed(() => { const g = window.__game, e = g.editor; return { song: e.lv.song, playing: g.audio.current, auditioning: !!e.audition, bpm: +(g.audio.clock.bps * 60).toFixed(1), info: document.getElementById('edSongInfo').textContent.slice(0, 70), button: document.getElementById('edSongPlay').textContent }; });
await p.screenshot({ path: `${out}/editor-3b-song.png` });
await p.tap('#edSongPlay'); await sleep(300);
res.stopped = await ed(() => ({ auditioning: !!window.__game.editor.audition, playing: window.__game.audio.current }));
await p.evaluate(() => document.querySelector('[data-song="pulse"]').click());
await sleep(800);
res.builtIn = await ed(() => ({ song: window.__game.editor.lv.song, playing: window.__game.audio.current }));
await p.evaluate(() => document.querySelector('[data-mood="cold"]').click());
await sleep(600);
res.generated2 = await ed(() => window.__game.editor.lv.song);
const input = await p.$('#edFile');
await input.uploadFile(wavPath);
for (let t = 0; t < 40000 && !(await ed(() => !!window.__game.editor.lv.music)); t += 250) await sleep(250);
await sleep(600);
res.music = await ed(() => { const e = window.__game.editor, m = e.lv.music; return m && { name: m.name, bpm: m.bpm, t0: m.t0, first: m.first, speed: e.lv.speed, bars: e.lv.rows.length / 12, info: document.getElementById('edMusicInfo').textContent, energy: e.level.def.energy }; });
await p.screenshot({ path: `${out}/editor-4-music.png` });
// tempo correction and back, start one bar later and back
await p.evaluate(() => document.querySelector('[data-bpm="1"]').click()); await sleep(900);
res.bpmUp = await ed(() => window.__game.editor.lv.music.bpm);
await p.evaluate(() => document.querySelector('[data-bpm="-1"]').click()); await sleep(900);
res.bpmBack = await ed(() => ({ bpm: window.__game.editor.lv.music.bpm, t0: window.__game.editor.lv.music.t0 }));
await p.tap('#edListen'); await sleep(1200);
res.preview = await ed(() => ({ previewing: window.__game.audio.previewing, label: document.getElementById('edListen').textContent }));
await p.tap('#edListen'); await sleep(200);
await p.evaluate(() => document.querySelector('#edSheetMusic .edClose').click());
await sleep(300);
// adding music re-checks what was built: wait for that to finish
for (let t = 0; t < 60000 && (await ed(() => window.__game.editor.busy)); t += 250) await sleep(250);
res.recheck = await status();

// 4. the bot check, and the track sheet
await p.tap('#edTrack'); await sleep(300);
await p.screenshot({ path: `${out}/editor-5-track.png` });
await p.evaluate(() => document.querySelector('#edSheetTrack .edClose').click());
await sleep(200);
await p.tap('#edCheck');
await sleep(400);
res.checkOk = await waitStatus(/^[✓✖⚠]/);
res.check = await status();
await p.tap('#edZoom'); await sleep(250);
await p.screenshot({ path: `${out}/editor-6-zoom.png` });
await p.tap('#edZoom'); await sleep(150);

// 5. test drive: the file is the music and follows the ship
await p.tap('#edTest');
await sleep(4000);
res.test = await ed(() => { const g = window.__game, a = g.audio; return { mode: g.mode, test: g.custom?.test, hasTrack: !!g.custom?.track, speed: g.sim.level.def.speed, source: !!a.src, err: +a.trackError.toFixed(3), z: +g.sim.s.z.toFixed(0), hud: !document.getElementById('prac').hidden }; });
await p.screenshot({ path: `${out}/editor-7-test.png` });
await ed(() => window.__game.pause());
await sleep(300);
res.pauseLabel = await p.$eval('#quitBtn', (e) => e.textContent);
await p.tap('#quitBtn');
await sleep(500);
res.back = await ed(() => ({ mode: window.__game.mode, visible: !document.getElementById('editor').hidden, undo: window.__game.editor.undo.length }));

// 6. menu card, reload, play from the menu
await p.tap('#edBack');
await sleep(600);
res.menu = await ed(() => ({ mode: window.__game.mode, cards: [...document.querySelectorAll('.card.mine')].map((c) => c.querySelector('small').textContent + ' | ' + c.querySelector('strong').textContent) }));
await p.screenshot({ path: `${out}/editor-8-menu.png` });
await p.reload({ waitUntil: 'load' });
await sleep(2500);
res.afterReload = await ed(() => [...document.querySelectorAll('.card.mine')].length);
await p.evaluate(() => document.querySelector('.card.mine strong').click());
// the stored file is decoded first; then the run starts with it as the music
for (let t = 0; t < 15000 && !(await ed(() => !!window.__game.audio.src)); t += 300) await sleep(300);
res.play = await ed(() => { const g = window.__game, a = g.audio; return { mode: g.mode, test: g.custom?.test, hasTrack: !!g.custom?.track, source: !!a.src, ctx: a.ctx?.state, attempts: g.attempts }; });
// Finnish, and a portrait phone
await p.evaluate(() => { const g = window.__game; g.toMenu(); });
await sleep(400);
await p.tap('#langBtn');
await sleep(300);
await p.evaluate(() => document.querySelector('.card.mine .pen').click());
await sleep(700);
await p.screenshot({ path: `${out}/editor-9-fi.png` });
await p.tap('#edSet'); await sleep(300);
await p.screenshot({ path: `${out}/editor-10-fi-panel.png` });
await p.evaluate(() => document.querySelector('#edSheetMusic .edClose').click()); await sleep(200);
await p.setViewport({ width: 390, height: 760, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await sleep(600);
await p.screenshot({ path: `${out}/editor-11-portrait.png` });
console.log(JSON.stringify(res, null, 1), errs);
await b.close();
