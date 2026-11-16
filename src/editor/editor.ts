import './editor.css';
import { analyse, envelopes, gridFeatures, mixDown, regrid, type Envelopes } from '../audio/analyze';
import type { GameAudio } from '../audio/audio';
import { MOODS, genName, songByName, type Mood } from '../audio/generate';
import { checkSong } from '../audio/lint';
import { SONGS } from '../audio/songs';
import { CHECK_STALL } from '../core/auto';
import { BAR_ROWS, BEAT_LEN, CFG } from '../core/config';
import {
  FLIP_FROM, MAX_BARS, MAX_BPM, MAX_SPEED, MIN_BARS, MIN_BPM, MIN_SPEED, barsOf, blankLevel, flipRanges, musicBars, musicStart, toDef, type CustomLevel,
} from '../core/custom';
import { F } from '../core/figures';
import { Level } from '../core/level';
import { lint, type Issue } from '../core/rules';
import { Solver, type SolveOptions } from '../core/solve';
import type { CustomStore } from '../game/custom-store';
import type { Tracks } from '../game/tracks';
import { PALETTES, type Palette } from '../render/palette';
import { css, drawTile } from './draw';

/**
 * THE LEVEL EDITOR (docs/EDITOR.md).
 *
 * The track is shown from above with the driving direction to the right: five lanes, three columns to a
 * beat, twelve to a bar. It is built one tile ("block") at a time, section by section; lighter columns mark the beat rows
 * and always sit on the beat. The player's own music is analysed (audio/analyze.ts) and sets the tempo and
 * so the speed, and its loudness is drawn above the track, beat by beat, so the track can be built to it.
 *
 * The editor only edits a CustomLevel and stores it; playing it is the game's business (EditorHost.test).
 */
export interface EditorHost {
  store: CustomStore;
  tracks: Tracks;
  audio: GameAudio;
  t(key: string): string;
  /** Leave for a test drive that starts at the checkpoint at or before `row`. */
  test(level: CustomLevel, row: number): void;
  exit(): void;
  /** The track was changed in a way that makes its old records meaningless. */
  changed(id: string): void;
}

type Tool = { kind: 'pan' } | { kind: 'tile'; t: string } | { kind: 'flip' };
interface Snap { rows: string[]; flipRows: number[] }
type Drag =
  | { kind: 'pan'; x: number; scroll: number }
  | { kind: 'map' }
  | { kind: 'paint'; t: string; row: number; lane: number }
  | { kind: 'flip'; on: boolean; row: number }
  | null;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const pause = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** Canvas layout, in CSS pixels: the music strip on top, the minimap at the bottom, the lanes between. */
const STRIP = 30, MAP = 34, GAP = 6;
const ZOOMS = [34, 20];
/** A new track is one section long; the player adds sections at the end as the track grows. */
const SECTION = 4;
/** Width of the "add a section" button drawn after the finish line. */
const ADD_W = 104;
/** Palette icons are drawn in a 34-unit box and shown this much larger. */
const ICON = 1.3;
const TILES: [string, string][] = [
  ['=', 'floor'], ['.', 'gap'], ['#', 'block'], ['x', 'spike'], ['o', 'gem'], ['O', 'gemHigh'], ['*', 'gemAir'], ['+', 'gemPad'],
  ['^', 'pad'], ['>', 'boost'], ['n', 'air'], ['i', 'ice'], ['m', 'move'], ['|', 'rail'],
];
/** Intensity per bar while a song is auditioned in the editor: every layer of the arrangement within eight bars. */
const AUDITION = '11223333';

export class Editor {
  private root = $('editor');
  private cv = $<HTMLCanvasElement>('edGrid');
  private c = this.cv.getContext('2d')!;
  private map = document.createElement('canvas');
  private w = 0; private h = 0; private dpr = 1;

  private lv: CustomLevel = blankLevel('', '');
  private level = new Level(toDef(this.lv));
  private pal: Palette = PALETTES[0];
  /** What the records of this track were earned on; a different track means they no longer count. */
  private sig = '';
  private undo: Snap[] = []; private redo: Snap[] = [];
  private tool: Tool = { kind: 'tile', t: '#' };
  private cw = ZOOMS[0];
  private scroll = -20;
  private ptrs = new Map<number, { x: number; y: number }>();
  private drag: Drag = null;
  private issues: Issue[] = [];
  private issueAt = 0;
  private stuckRow = -1;
  private note = '';
  private noteGood = false;
  /** Bumped on every change, so a running check or fill knows its result is stale. */
  private gen = 0;
  private busy = false;
  private queued = false;
  private buf?: AudioBuffer;
  private env?: Envelopes;
  private musicNote = '';
  private deleteArmed = false;
  /** Animation frame of a song being auditioned (0 = none), and when it started. */
  private audition = 0;
  private auditionT0 = 0;

  constructor(private host: EditorHost) {
    $('edBack').addEventListener('click', () => this.close());
    $('edUndo').addEventListener('click', () => this.step(this.undo, this.redo));
    $('edRedo').addEventListener('click', () => this.step(this.redo, this.undo));
    $('edZoom').addEventListener('click', () => this.zoom());
    $('edSet').addEventListener('click', () => this.panel('music'));
    $('edTrack').addEventListener('click', () => this.panel('track'));
    document.querySelectorAll('.edClose').forEach((b) => b.addEventListener('click', () => this.panel(null)));
    $('edCheck').addEventListener('click', () => void this.check());
    $('edTest').addEventListener('click', () => this.test());
    $('edStatus').addEventListener('click', () => this.nextIssue());
    const name = $<HTMLInputElement>('edName');
    name.addEventListener('input', () => { this.lv.name = name.value.trim().slice(0, 24) || this.host.t('ed.track'); this.persist(); });
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); });

    // music and track settings
    $('edPick').addEventListener('click', () => { this.host.audio.unlock(); $<HTMLInputElement>('edFile').click(); });
    $<HTMLInputElement>('edFile').addEventListener('change', (e) => {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      input.value = '';
      if (file) void this.addMusic(file);
    });
    $('edPanel').addEventListener('click', (e) => {
      const d = (e.target as HTMLElement).dataset;
      if (d.bpm) void this.setBpm(+d.bpm);
      else if (d.first) this.shiftStart(+d.first, 0);
      else if (d.nudge) this.shiftStart(0, +d.nudge);
      else if (d.half && this.lv.music) this.shiftStart(0, 30 / this.lv.music.bpm);
      else if (d.bars) this.setBars(barsOf(this.lv) + +d.bars);
      else if (d.world) { this.lv.world = +d.world; this.persist(); this.theme(); this.refreshPanel(); }
      else if (d.song) { this.lv.song = d.song; this.persist(); this.playSong(); }
      else if (d.mood) this.generate(d.mood as Mood);
    });
    $('edSongPlay').addEventListener('click', () => { if (this.audition) this.stopSong(); else this.playSong(); });
    $('edListen').addEventListener('click', () => this.listen());
    $('edFit').addEventListener('click', () => { if (this.lv.music) this.setBars(musicBars(this.lv.music)); });
    $('edNoMusic').addEventListener('click', () => this.removeMusic());
    const speed = $<HTMLInputElement>('edSpeed');
    speed.addEventListener('input', () => { if (!this.lv.music) { this.lv.speed = +speed.value; this.changedRows(false); this.refreshPanel(); } });
    $('edDelete').addEventListener('click', () => this.remove());

    const cv = this.cv;
    cv.addEventListener('pointerdown', (e) => this.down(e));
    cv.addEventListener('pointermove', (e) => this.move(e));
    const up = (e: PointerEvent) => this.up(e);
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => { e.preventDefault(); this.scrollTo(this.scroll + (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY)); }, { passive: false });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('resize', () => { if (!this.root.hidden) this.resize(); });
  }

  get isOpen(): boolean { return !this.root.hidden; }

  private t(key: string, n?: number | string): string {
    const s = this.host.t(key);
    return n === undefined ? s : s.replace('{n}', String(n));
  }

  // ------------------------------------------------------------------ open / close

  /** Open a stored track, or a new one when `id` is not given. `row` scrolls there (back from a test drive). */
  open(id?: string, row?: number): void {
    const src = id ? this.host.store.get(id) : undefined;
    if (!src || src.id !== this.lv.id) {
      this.lv = src ? (JSON.parse(JSON.stringify(src)) as CustomLevel) : blankLevel(this.host.store.newId(), `${this.host.t('ed.track')} ${this.host.store.list().length + 1}`, SECTION);
      this.undo = []; this.redo = [];
      this.buf = undefined; this.env = undefined; this.musicNote = '';
      this.scroll = -20;
      this.sig = this.signature();
      // building starts one block at a time
      this.tool = { kind: 'tile', t: '#' };
      if (this.lv.music) void this.loadMusic();
    }
    this.note = src ? '' : this.t('ed.intro');
    this.noteGood = true;
    this.stuckRow = -1;
    this.deleteArmed = false;
    this.root.hidden = false;
    $<HTMLInputElement>('edName').value = this.lv.name;
    this.panel(null);
    this.theme();
    this.resize();
    this.rebuild();
    this.palette();
    if (row !== undefined) this.scrollTo(row * this.cw - this.w * 0.3);
  }

  private close(): void {
    this.stopSong();
    this.host.audio.stopPreview();
    this.reportChange();
    this.root.hidden = true;
    this.host.exit();
  }

  private signature(): string { return JSON.stringify([this.lv.rows, this.lv.flipRows, this.lv.speed]); }

  private reportChange(): void {
    const s = this.signature();
    if (s !== this.sig) { this.sig = s; this.host.changed(this.lv.id); }
  }

  private persist(): void {
    this.host.store.put(this.lv);
  }

  private theme(): void {
    this.pal = PALETTES[this.lv.world % PALETTES.length];
    this.root.style.setProperty('--a', this.pal.css);
    this.root.style.setProperty('--b', this.pal.css2);
    this.mapDirty = true;
    this.palette();
    this.draw();
  }

  // ------------------------------------------------------------------ the track

  /** After any change to rows, flip zones or speed. */
  private rebuild(): void {
    this.gen++;
    this.level = new Level(toDef(this.lv));
    this.issues = lint(this.level);
    this.issueAt = 0;
    this.mapDirty = true;
    this.info();
    this.status();
    this.draw();
  }

  private changedRows(clearCheck = true): void {
    if (clearCheck) { this.stuckRow = -1; this.note = ''; }
    this.persist();
    this.rebuild();
  }

  private snap(): void {
    this.undo.push({ rows: this.lv.rows.slice(), flipRows: this.lv.flipRows.slice() });
    if (this.undo.length > 80) this.undo.shift();
    this.redo.length = 0;
  }

  private step(from: Snap[], to: Snap[]): void {
    const s = from.pop();
    if (!s) return;
    to.push({ rows: this.lv.rows.slice(), flipRows: this.lv.flipRows.slice() });
    this.lv.rows = s.rows; this.lv.flipRows = s.flipRows;
    this.changedRows();
  }

  private setTile(row: number, lane: number, t: string): boolean {
    const r = this.lv.rows[row];
    if (r === undefined || lane < 0 || lane >= CFG.lanes || r[lane] === t) return false;
    this.lv.rows[row] = r.slice(0, lane) + t + r.slice(lane + 1);
    return true;
  }

  private setBars(bars: number): void {
    const n = Math.max(MIN_BARS, Math.min(MAX_BARS, Math.round(bars)));
    if (n === barsOf(this.lv)) return;
    this.snap();
    const rows = this.lv.rows.slice(0, n * BAR_ROWS);
    while (rows.length < n * BAR_ROWS) rows.push(F);
    this.lv.rows = rows;
    this.lv.flipRows = this.lv.flipRows.filter((r) => r < n * BAR_ROWS);
    this.changedRows();
    this.scrollTo(this.scroll);
    this.refreshPanel();
  }

  private info(): void {
    const lv = this.lv, bars = barsOf(lv);
    const secs = Math.round((bars * BAR_ROWS * CFG.tileL) / lv.speed);
    const bpm = lv.speed * 5;
    $('edTrackInfo').textContent = `${+bpm.toFixed(1)} BPM · ${+lv.speed.toFixed(1)} m/s · ${bars} ${this.t('ed.bars')} · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    $('edUndo').classList.toggle('off', !this.undo.length);
    $('edRedo').classList.toggle('off', !this.redo.length);
  }

  // ------------------------------------------------------------------ status line

  private toolHelp(): string {
    const tl = this.tool;
    const k = tl.kind === 'pan' ? 'ed.t.pan' : tl.kind === 'flip' ? 'ed.t.flip' : 'ed.t.' + TILES.find(([c]) => c === tl.t)![1];
    return `${this.t(k + '.n')}: ${this.t(k + '.d')}`;
  }

  private barOf(row: number): number { return Math.floor(row / BAR_ROWS) + 1; }

  private status(): void {
    const el = $('edStatus');
    let text: string, cls = '';
    if (this.busy) { text = this.note; cls = 'busy'; }
    else if (this.note) { text = this.note; cls = this.noteGood ? 'good' : 'bad'; }
    else if (this.issues.length) {
      const i = this.issues[Math.min(this.issueAt, this.issues.length - 1)];
      text = `⚠ ${this.issues.length} · ${this.t('ed.barN', this.barOf(i.row))}: ${this.t('ed.lint.' + i.code)}`;
      cls = 'warn';
    } else if (this.lv.music && barsOf(this.lv) > musicBars(this.lv.music)) {
      text = `\u266A ${this.t('ed.musicShort', Math.max(0, musicBars(this.lv.music)))}`;
      cls = 'warn';
    } else text = this.toolHelp();
    el.textContent = text;
    el.className = cls;
    // while a bot is at work the track cannot be changed, checked again or driven
    this.root.classList.toggle('working', this.busy);
  }

  private say(text: string, good: boolean): void { this.note = text; this.noteGood = good; this.status(); }

  /** Tap on the status line: jump to the stuck spot, or to the next rule hint. */
  private nextIssue(): void {
    if (this.stuckRow >= 0) { this.center(this.stuckRow); return; }
    if (!this.issues.length) return;
    this.issueAt = (this.issueAt + 1) % this.issues.length;
    this.note = '';
    this.center(this.issues[this.issueAt].row);
    this.status();
  }

  // ------------------------------------------------------------------ check and test drive

  private async solve(level: Level, opt: SolveOptions, gen: number): Promise<Solver | null> {
    const s = new Solver(level, { ...opt, stall: CHECK_STALL });
    while (!s.run(4000)) {
      await pause();
      if (gen !== this.gen) return null;
    }
    return s;
  }

  /** Let the bots play the track: first pressing jump only on the beat, and if that fails, freely. */
  private async check(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.stuckRow = -1;
    this.say(this.t('ed.checking'), true);
    const gen = this.gen, level = this.level;
    await pause();
    const beat = await this.solve(level, { onBeat: true }, gen);
    let free: Solver | null = null;
    if (beat && !beat.ok) free = await this.solve(level, {}, gen);
    this.busy = false;
    if (!beat || gen !== this.gen) { this.note = ''; this.status(); return; }
    if (beat.ok) this.say(this.t('ed.ok'), true);
    else {
      const off = !!free?.ok;
      this.stuckRow = Math.min(this.lv.rows.length - 1, Math.floor((off ? beat.furthest : free?.furthest ?? beat.furthest) / CFG.tileL));
      this.say(this.t(off ? 'ed.offBeat' : 'ed.stuck', this.barOf(this.stuckRow)), false);
      this.center(this.stuckRow);
    }
    this.draw();
  }

  private test(): void {
    if (this.busy) return;
    this.stopSong();
    this.host.audio.stopPreview();
    this.persist();
    this.reportChange();
    this.root.hidden = true;
    this.host.test(this.lv, Math.max(0, Math.floor((this.scroll + 8) / this.cw)));
  }

  // ------------------------------------------------------------------ music

  private async loadMusic(): Promise<void> {
    const id = this.lv.id;
    const buf = await this.host.tracks.buffer(this.lv);
    if (id !== this.lv.id) return;
    this.buf = buf;
    this.musicNote = buf ? '' : this.t('ed.noFile');
    this.refreshPanel();
  }

  private async addMusic(file: File): Promise<void> {
    const id = this.lv.id;
    this.stopSong();
    this.host.audio.stopPreview();
    this.musicNote = this.t('ed.analysing');
    this.refreshPanel();
    // two frames, so the label is on screen before the heavy work starts
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      const data = await file.arrayBuffer();
      const buf = await this.host.audio.decode(data.slice(0));
      if (id !== this.lv.id) return;
      const chans: Float32Array[] = [];
      for (let ch = 0; ch < buf.numberOfChannels; ch++) chans.push(buf.getChannelData(ch));
      const res = analyse(mixDown(chans), buf.sampleRate, file.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 40));
      this.buf = buf; this.env = res.env;
      this.host.tracks.set(id, buf);
      this.lv.music = res.music;
      this.lv.speed = res.music.bpm / 5;
      this.musicNote = '';
      this.changedRows();
      const kept = await this.host.store.putAudio(id, data);
      if (id !== this.lv.id) return;
      if (!kept) this.musicNote = this.t('ed.sessionOnly');
      // what was built before now runs at the song's tempo: see that it still works
      if (!this.lv.rows.every((r) => r === F)) void this.check();
    } catch {
      if (id !== this.lv.id) return;
      this.musicNote = this.t('ed.badFile');
    }
    this.refreshPanel();
  }

  private removeMusic(): void {
    this.host.audio.stopPreview();
    this.host.store.removeAudio(this.lv.id);
    this.host.tracks.set(this.lv.id, undefined);
    this.buf = undefined; this.env = undefined; this.musicNote = '';
    this.lv.music = undefined;
    this.lv.speed = Math.max(MIN_SPEED, Math.min(MAX_SPEED, Math.round(this.lv.speed)));
    this.changedRows();
    this.refreshPanel();
  }

  /** The player corrects the tempo: the beat grid is found again for it. */
  private async setBpm(delta: number): Promise<void> {
    const m = this.lv.music;
    if (!m || !this.buf) return;
    const bpm = Math.round((m.bpm + delta) * 100) / 100;
    if (bpm < MIN_BPM || bpm >= MAX_BPM) return;
    this.host.audio.stopPreview();
    if (!this.env) {
      this.musicNote = this.t('ed.analysing');
      this.refreshPanel();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const chans: Float32Array[] = [];
      for (let ch = 0; ch < this.buf.numberOfChannels; ch++) chans.push(this.buf.getChannelData(ch));
      this.env = envelopes(mixDown(chans), this.buf.sampleRate);
      this.musicNote = '';
    }
    this.lv.music = regrid(this.env, bpm, m.name);
    this.lv.speed = bpm / 5;
    this.changedRows();
    this.refreshPanel();
    if (!this.lv.rows.every((r) => r === F)) void this.check();
  }

  /** Move the start of the track in the song by whole beats, or the whole grid by a few milliseconds. */
  private shiftStart(beats: number, seconds: number): void {
    const m = this.lv.music;
    if (!m) return;
    this.host.audio.stopPreview();
    if (beats) m.first = Math.max(-8, Math.min(m.loud.length - 8, m.first + beats));
    if (seconds) {
      // the grid itself moves: by a few milliseconds, or by half a beat when the clicks fall between the beats
      const beat = 60 / m.bpm;
      let t0 = m.t0 + seconds;
      if (t0 >= beat) t0 -= beat;
      m.t0 = Math.round(t0 * 1000) / 1000;
      if (this.env && Math.abs(seconds) > 0.05) { const g = gridFeatures(this.env, m.bpm, m.t0); m.loud = g.loud; m.hits = g.hits; }
    }
    this.persist();
    this.rebuild();
    this.refreshPanel();
  }

  private listen(): void {
    const a = this.host.audio, m = this.lv.music;
    this.stopSong();
    if (a.previewing) a.stopPreview();
    else if (m && this.buf) {
      a.unlock();
      a.preview({ buf: this.buf, bpm: m.bpm, start: musicStart(m) }, 16);
      window.setTimeout(() => this.refreshPanel(), 16300);
    }
    this.refreshPanel();
  }

  /**
   * "New song": the generator (audio/generate.ts) writes a song from a random seed in the chosen mood. The
   * track stores only its name, `gen:<seed>:<mood>`; the same name always gives the same song.
   */
  private generate(mood: Mood): void {
    let name = '';
    for (let tries = 0; tries < 8; tries++) {
      name = genName(10000 + Math.floor(Math.random() * 90000), mood);
      const song = songByName(name);
      if (song && !checkSong(song).length) break;
    }
    this.lv.song = name;
    this.persist();
    this.playSong();
  }

  /**
   * Audition the track's song at the track's tempo. In the game the music follows the ship; here a clock
   * stands in for the ship, and the bars step through every intensity so the whole arrangement is heard.
   */
  private playSong(): void {
    const a = this.host.audio;
    this.stopSong();
    a.unlock();
    a.stopPreview();
    a.resume();
    const bps = this.lv.speed / BEAT_LEN;
    const bars = AUDITION.length;
    a.playSong(this.lv.song, { energy: (bar) => +AUDITION[Math.max(0, Math.min(bars - 1, bar))] });
    this.auditionT0 = performance.now();
    const tick = (): void => {
      const beat = ((performance.now() - this.auditionT0) / 1000) * bps;
      if (beat >= bars * CFG.beatsPerBar || this.root.hidden) { this.stopSong(); return; }
      a.sync(beat, bps);
      this.audition = requestAnimationFrame(tick);
    };
    this.audition = requestAnimationFrame(tick);
    this.refreshPanel();
  }

  private stopSong(): void {
    if (!this.audition) return;
    cancelAnimationFrame(this.audition);
    this.audition = 0;
    this.host.audio.stopMusic();
    this.refreshPanel();
  }

  private remove(): void {
    if (!this.deleteArmed) { this.deleteArmed = true; this.refreshPanel(); return; }
    this.stopSong();
    this.host.audio.stopPreview();
    this.host.store.remove(this.lv.id);
    this.host.tracks.set(this.lv.id, undefined);
    this.host.changed(this.lv.id);
    this.lv = blankLevel('', '');
    this.root.hidden = true;
    this.host.exit();
  }

  /** The music sheet, the track sheet, or none. */
  private panel(which: 'music' | 'track' | null): void {
    $('edPanel').hidden = !which;
    $('edSheetMusic').hidden = which !== 'music';
    $('edSheetTrack').hidden = which !== 'track';
    this.deleteArmed = false;
    if (which) { this.info(); this.refreshPanel(); }
    else { this.stopSong(); this.host.audio.stopPreview(); }
  }

  private refreshPanel(): void {
    if ($('edPanel').hidden) return;
    const lv = this.lv, m = lv.music;
    $('edMusicCtl').hidden = !m;
    // with a file of your own the game song is only a stand-in: keep the sheet to one choice
    $('edGameSec').hidden = !!m;
    $('edMusicLead').textContent = this.t(m ? 'ed.musicLeadOwn' : 'ed.musicLead');
    let info = this.musicNote;
    if (m && !info) {
      const d = Math.round(m.duration);
      info = `${m.name} · ${Math.floor(d / 60)}:${String(d % 60).padStart(2, '0')} · ${this.t('ed.musicBars', Math.max(0, musicBars(m)))}`;
    }
    $('edMusicInfo').textContent = info || this.t('ed.musicNote');
    if (m) {
      $('edBpm').textContent = `${m.bpm.toFixed(2)} BPM`;
      const s = musicStart(m);
      $('edStart').textContent = `${s < 0 ? '-' : ''}${Math.floor(Math.abs(s) / 60)}:${(Math.abs(s) % 60).toFixed(2).padStart(5, '0')}`;
      $('edListen').textContent = this.t(this.host.audio.previewing ? 'ed.stop' : 'ed.listen');
      $('edListen').classList.toggle('off', !this.buf);
      $('edMusicCtl').querySelectorAll<HTMLElement>('[data-bpm]').forEach((b) => b.classList.toggle('off', !this.buf));
    }
    // built-in songs by name; a generated one shows as its own chip
    const gen = /^gen:([^:]+)(?::(\w+))?$/.exec(lv.song);
    $('edSongs').innerHTML = Object.keys(SONGS).filter((s) => s !== 'menu')
      .map((s) => `<button data-song="${s}" class="${s === lv.song ? 'on' : ''}">${s.toUpperCase()}</button>`).join('')
      + (gen ? `<button data-song="${lv.song}" class="on">\u2726 ${gen[1]}</button>` : '');
    $('edMoods').innerHTML = MOODS.map((mood) => `<button data-mood="${mood}" class="${gen?.[2] === mood ? 'on' : ''}">\u2726 ${this.t('ed.mood.' + mood)}</button>`).join('');
    const song = songByName(lv.song);
    $('edSongInfo').textContent = `${song ? (gen ? `\u2726 ${gen[2] ? this.t('ed.mood.' + gen[2]) + ' ' : ''}${gen[1]}` : lv.song.toUpperCase()) + '. ' : ''}${this.t('ed.genNote')}`;
    $('edSongPlay').textContent = this.t(this.audition ? 'ed.songStop' : 'ed.songPlay');
    const sp = $<HTMLInputElement>('edSpeed');
    sp.min = String(MIN_SPEED); sp.max = String(MAX_SPEED); sp.value = String(Math.round(lv.speed));
    $('edSpeedVal').textContent = `${Math.round(lv.speed)} m/s = ${Math.round(lv.speed * 5)} BPM`;
    $('edThemes').innerHTML = PALETTES.map((p, i) => `<button data-world="${i}" class="${i === lv.world % PALETTES.length ? 'on' : ''}" style="background:linear-gradient(135deg,${css(p.floor)} 0 45%,${p.css} 45% 70%,${css(p.block)} 70%)"></button>`).join('');
    $('edBars').textContent = `${barsOf(lv)} ${this.t('ed.bars')}`;
    $('edDelete').textContent = this.t(this.deleteArmed ? 'ed.deleteSure' : 'ed.delete');
    $('edDelete').classList.toggle('armed', this.deleteArmed);
  }

  // ------------------------------------------------------------------ tool palette

  private palette(): void {
    if (this.root.hidden) return;
    const box = $('edPalette');
    box.textContent = '';
    const add = (label: string, on: boolean, w: number, paint: (c: CanvasRenderingContext2D) => void, pick: () => void) => {
      const b = document.createElement('button');
      b.className = on ? 'on' : '';
      const cv = document.createElement('canvas');
      cv.width = Math.round(w * 2 * ICON); cv.height = Math.round(68 * ICON);
      cv.style.width = Math.round(w * ICON) + 'px'; cv.style.height = Math.round(34 * ICON) + 'px';
      const c = cv.getContext('2d')!;
      c.scale(2 * ICON, 2 * ICON);
      paint(c);
      const s = document.createElement('span');
      s.textContent = label;
      b.append(cv, s);
      b.addEventListener('click', () => { pick(); this.note = ''; this.palette(); this.status(); });
      box.appendChild(b);
    };
    const tl = this.tool, pal = this.pal;
    add(this.t('ed.t.pan.n'), tl.kind === 'pan', 34, (c) => {
      c.strokeStyle = '#fff'; c.lineWidth = 2; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(6, 17); c.lineTo(28, 17); c.moveTo(11, 12); c.lineTo(6, 17); c.lineTo(11, 22); c.moveTo(23, 12); c.lineTo(28, 17); c.lineTo(23, 22); c.stroke();
    }, () => { this.tool = { kind: 'pan' }; });
    for (const [ch, key] of TILES) {
      add(this.t(`ed.t.${key}.n`), tl.kind === 'tile' && tl.t === ch, 34, (c) => {
        c.fillStyle = '#04041a'; c.fillRect(2, 2, 30, 30);
        drawTile(c, ch, pal, 3, 3, 28, 28);
      }, () => { this.tool = { kind: 'tile', t: ch }; });
    }
    add(this.t('ed.t.flip.n'), tl.kind === 'flip', 34, (c) => {
      c.fillStyle = 'rgba(255,60,220,.35)'; c.fillRect(2, 2, 30, 30);
      c.strokeStyle = '#fff'; c.lineWidth = 2; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(12, 25); c.lineTo(12, 9); c.lineTo(8, 13); c.moveTo(12, 9); c.lineTo(16, 13);
      c.moveTo(22, 9); c.lineTo(22, 25); c.lineTo(18, 21); c.moveTo(22, 25); c.lineTo(26, 21); c.stroke();
    }, () => { this.tool = { kind: 'flip' }; });
  }

  // ------------------------------------------------------------------ view

  private zoom(): void {
    const mid = (this.scroll + this.w / 2) / this.cw;
    this.cw = ZOOMS[(ZOOMS.indexOf(this.cw) + 1) % ZOOMS.length];
    this.scrollTo(mid * this.cw - this.w / 2);
  }

  private scrollTo(x: number): void {
    const max = Math.max(-20, this.lv.rows.length * this.cw - this.w + ADD_W + 40);
    this.scroll = Math.max(-20, Math.min(max, x));
    this.draw();
  }

  private center(row: number): void { this.scrollTo((row + 0.5) * this.cw - this.w / 2); }

  private resize(): void {
    const r = this.cv.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(50, Math.round(r.width)); this.h = Math.max(50, Math.round(r.height));
    this.cv.width = this.w * this.dpr; this.cv.height = this.h * this.dpr;
    this.mapDirty = true;
    this.scrollTo(this.scroll);
  }

  private get laneH(): number { return (this.h - STRIP - MAP - GAP) / CFG.lanes; }

  private cellAt(x: number, y: number): { row: number; lane: number } | null {
    const row = Math.floor((x + this.scroll) / this.cw), lane = Math.floor((y - STRIP) / this.laneH);
    return row >= 0 && row < this.lv.rows.length && lane >= 0 && lane < CFG.lanes ? { row, lane } : null;
  }

  // ------------------------------------------------------------------ pointer

  private pos(e: PointerEvent): { x: number; y: number } {
    const r = this.cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private down(e: PointerEvent): void {
    e.preventDefault();
    try { this.cv.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    const p = this.pos(e);
    this.ptrs.set(e.pointerId, p);
    if (this.busy) return;
    if (this.ptrs.size === 2) {
      // a second finger turns whatever was going on into scrolling
      if (this.drag?.kind === 'paint') { const s = this.undo.pop(); if (s) { this.lv.rows = s.rows; this.lv.flipRows = s.flipRows; this.rebuild(); } }
      if (this.drag?.kind === 'flip') { const s = this.undo.pop(); if (s) { this.lv.rows = s.rows; this.lv.flipRows = s.flipRows; this.rebuild(); } }
      this.drag = { kind: 'pan', x: this.midX(), scroll: this.scroll };
      return;
    }
    if (this.ptrs.size > 2) return;
    if (p.y >= this.h - MAP - GAP / 2) { this.drag = { kind: 'map' }; this.mapScroll(p.x); return; }
    if (this.overAdd(p)) { this.addSection(); return; }
    const tl = this.tool;
    const cell = this.cellAt(p.x, p.y);
    if (p.y < STRIP || tl.kind === 'pan' || !cell) { this.drag = { kind: 'pan', x: p.x, scroll: this.scroll }; return; }
    if (tl.kind === 'flip') {
      // drag across the columns that are to be upside down; starting on a flipped column wipes instead
      if (cell.row < FLIP_FROM) return; // the ship starts here
      this.snap();
      const on = !this.lv.flipRows.includes(cell.row);
      this.setFlip(cell.row, on);
      this.drag = { kind: 'flip', on, row: cell.row };
      this.draw();
    } else if (tl.kind === 'tile') {
      // painting a tile onto itself wipes back to floor instead
      const t = this.lv.rows[cell.row][cell.lane] === tl.t && tl.t !== '=' ? '=' : tl.t;
      this.snap();
      this.setTile(cell.row, cell.lane, t);
      this.drag = { kind: 'paint', t, row: cell.row, lane: cell.lane };
      this.draw();
    }
  }

  private setFlip(row: number, on: boolean): void {
    if (row < FLIP_FROM || row >= this.lv.rows.length) return;
    const i = this.lv.flipRows.indexOf(row);
    if (on && i < 0) this.lv.flipRows.push(row);
    else if (!on && i >= 0) this.lv.flipRows.splice(i, 1);
  }

  /** Is the point on the "add a section" button after the finish line? */
  private overAdd(p: { x: number; y: number }): boolean {
    const x = this.lv.rows.length * this.cw - this.scroll + 16;
    return barsOf(this.lv) < MAX_BARS && p.x >= x && p.x <= x + ADD_W && p.y >= STRIP && p.y < STRIP + this.laneH * CFG.lanes;
  }

  /** One more section of plain road at the end, scrolled into view. */
  private addSection(): void {
    const from = this.lv.rows.length;
    this.setBars(barsOf(this.lv) + SECTION);
    this.scrollTo(from * this.cw - this.w * 0.25);
  }

  private midX(): number {
    let s = 0;
    for (const p of this.ptrs.values()) s += p.x;
    return s / (this.ptrs.size || 1);
  }

  private move(e: PointerEvent): void {
    if (!this.ptrs.has(e.pointerId)) return;
    e.preventDefault();
    const p = this.pos(e);
    this.ptrs.set(e.pointerId, p);
    const d = this.drag;
    if (!d) return;
    if (d.kind === 'pan') this.scrollTo(d.scroll - ((this.ptrs.size > 1 ? this.midX() : p.x) - d.x));
    else if (d.kind === 'map') this.mapScroll(p.x);
    else if (d.kind === 'flip') {
      const cell = this.cellAt(p.x, p.y);
      if (!cell) return;
      for (let r = Math.min(d.row, cell.row); r <= Math.max(d.row, cell.row); r++) this.setFlip(r, d.on);
      d.row = cell.row;
      this.draw();
    } else {
      const cell = this.cellAt(p.x, p.y);
      if (!cell) return;
      // fill in the cells a fast finger skipped
      const steps = Math.max(Math.abs(cell.row - d.row), Math.abs(cell.lane - d.lane), 1);
      let any = false;
      for (let i = 1; i <= steps; i++) {
        any = this.setTile(Math.round(d.row + ((cell.row - d.row) * i) / steps), Math.round(d.lane + ((cell.lane - d.lane) * i) / steps), d.t) || any;
      }
      d.row = cell.row; d.lane = cell.lane;
      if (any) this.draw();
    }
  }

  private up(e: PointerEvent): void {
    if (!this.ptrs.delete(e.pointerId)) return;
    const d = this.drag;
    if (this.ptrs.size > 0) { if (d?.kind === 'pan') this.drag = { kind: 'pan', x: this.midX(), scroll: this.scroll }; return; }
    this.drag = null;
    if (d?.kind === 'paint') this.changedRows();
    else if (d?.kind === 'flip') { this.lv.flipRows.sort((a, b) => a - b); this.changedRows(); }
  }

  private mapScroll(x: number): void {
    this.scrollTo((x / this.w) * this.lv.rows.length * this.cw - this.w / 2);
  }

  // ------------------------------------------------------------------ drawing

  private mapDirty = true;

  private drawMap(): void {
    const m = this.map, W = this.w, n = this.lv.rows.length, pal = this.pal;
    m.width = W; m.height = MAP;
    const c = m.getContext('2d')!;
    c.fillStyle = '#04041a';
    c.fillRect(0, 0, W, MAP);
    const lh = MAP / CFG.lanes;
    const col: Record<string, string> = {
      '=': css(pal.floor), '#': css(pal.block), x: css(pal.block), o: css(pal.gem), O: css(pal.gem), '*': css(pal.gem), '+': css(pal.gem),
      '^': css(pal.accent), '>': '#fff', i: '#bfeaff', m: css(pal.edge), '|': css(pal.edge), n: css(pal.blockEdge),
    };
    for (let x = 0; x < W; x++) {
      const row = this.lv.rows[Math.min(n - 1, Math.floor((x / W) * n))];
      for (let l = 0; l < CFG.lanes; l++) {
        const k = col[row[l]];
        if (k) { c.fillStyle = k; c.fillRect(x, l * lh, 1, lh); }
      }
    }
    this.mapDirty = false;
  }

  private draw(): void {
    if (this.queued || this.root.hidden) return;
    this.queued = true;
    requestAnimationFrame(() => { this.queued = false; this.paint(); });
  }

  private paint(): void {
    if (this.root.hidden || !this.w) return;
    const c = this.c, W = this.w, H = this.h, pal = this.pal, cw = this.cw, lv = this.lv, rows = lv.rows, n = rows.length;
    const gy = STRIP, lh = this.laneH, gh = lh * CFG.lanes;
    const X = (r: number) => r * cw - this.scroll;
    const font = (px: number) => `700 ${px}px Orbitron, system-ui, sans-serif`;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = '#0a0a2e';
    c.fillRect(0, 0, W, H);
    const r0 = Math.max(0, Math.floor(this.scroll / cw)), r1 = Math.min(n, Math.ceil((this.scroll + W) / cw));

    // the void under the track, and a lighter band on every beat row: that is where the beat sounds
    c.fillStyle = '#04041a';
    c.fillRect(Math.max(0, X(0)), gy, Math.min(W, X(n)) - Math.max(0, X(0)), gh);
    const pad = cw > 24 ? 1 : 0.5;
    for (let r = r0; r < r1; r++) for (let l = 0; l < CFG.lanes; l++) drawTile(c, rows[r][l], pal, X(r) + pad, gy + l * lh + pad, cw - 2 * pad, lh - 2 * pad);
    c.fillStyle = 'rgba(255,255,255,.13)';
    for (let r = r0; r < r1; r++) if (r % CFG.rowsPerBeat === 0) c.fillRect(X(r), gy, cw, gh);
    // the glowing edges of the road
    c.save();
    c.shadowColor = pal.css; c.shadowBlur = 8; c.fillStyle = pal.css;
    const ex = Math.max(0, X(0)), ew = Math.min(W, X(n)) - ex;
    c.fillRect(ex, gy - 1, ew, 2);
    c.fillRect(ex, gy + gh - 1, ew, 2);
    c.restore();

    // gravity-flip zones
    for (const [from, to] of flipRanges(lv.flipRows, n)) {
      const x = X(from), wd = (to - from) * cw;
      if (x > W || x + wd < 0) continue;
      c.fillStyle = 'rgba(255,60,220,.24)';
      c.fillRect(x, gy, wd, gh);
      c.strokeStyle = '#ff7ae6'; c.lineWidth = 2;
      c.strokeRect(x + 1, gy + 1, wd - 2, gh - 2);
      c.fillStyle = '#ff7ae6'; c.font = font(11); c.textAlign = 'center';
      c.fillText('\u21C5', x + wd / 2, STRIP - 5);
    }

    // beat lines (dashed) and bar lines (solid, numbered)
    c.textAlign = 'left';
    for (let r = r0 - (r0 % CFG.rowsPerBeat); r <= r1; r += CFG.rowsPerBeat) {
      const x = Math.round(X(r)) + 0.5, isBar = r % BAR_ROWS === 0;
      c.strokeStyle = isBar ? pal.css : 'rgba(255,255,255,.3)';
      c.lineWidth = isBar ? 2 : 1;
      c.setLineDash(isBar ? [] : [3, 4]);
      c.beginPath(); c.moveTo(x, isBar ? 0 : gy); c.lineTo(x, gy + gh); c.stroke();
      if (isBar && r < n) { c.fillStyle = '#fff'; c.font = font(10); c.fillText(String(r / BAR_ROWS + 1), x + 4, 11); }
    }
    c.setLineDash([]);

    // the music, beat by beat: height is loudness, colour the intensity of the bar, a dot marks a strong hit
    const m = lv.music;
    const bw = CFG.rowsPerBeat * cw;
    for (let k = Math.floor(r0 / CFG.rowsPerBeat); k * CFG.rowsPerBeat < r1; k++) {
      const x = X(k * CFG.rowsPerBeat), e = this.level.energyOf(Math.floor(k / CFG.beatsPerBar));
      c.fillStyle = e >= 3 ? pal.css2 : pal.css;
      c.globalAlpha = e <= 1 ? 0.4 : e === 2 ? 0.7 : 1;
      if (m) {
        const i = m.first + k;
        const loud = i >= 0 && i < m.loud.length ? +m.loud[i] : 0;
        const hgt = 2 + (loud / 9) * 13;
        c.fillRect(x + 2, STRIP - 2 - hgt, bw - 4, hgt);
        if (+(m.hits[i] ?? 0) >= 6) { c.globalAlpha = 1; c.fillStyle = '#fff'; c.beginPath(); c.arc(x + 5, STRIP - 5 - hgt, 2, 0, 7); c.fill(); }
      } else if (k % CFG.beatsPerBar === 0) {
        // no file: the built-in song follows the track, so show how intense it will play this bar
        for (let j = 0; j < e; j++) c.fillRect(x + 4 + j * 9, STRIP - 9, 6, 5);
      }
      c.globalAlpha = 1;
    }

    // where the music file ends
    if (m) {
      const x = X(musicBars(m) * BAR_ROWS);
      if (x > 0 && x < W && musicBars(m) < barsOf(lv)) {
        c.fillStyle = 'rgba(4,4,26,.55)';
        c.fillRect(x, 0, W - x, STRIP);
        c.fillStyle = '#ffd23a'; c.font = font(9); c.textAlign = 'left';
        c.fillText('\u266A \u25A0', x + 16, 11);
      }
    }

    // practice checkpoints, the start and the finish
    c.fillStyle = pal.css2;
    for (const cp of this.level.checkpoints) {
      if (cp.row <= 0) continue;
      const x = X(cp.row);
      if (x < -6 || x > W + 6) continue;
      c.beginPath(); c.moveTo(x, gy - 1); c.lineTo(x + 4, gy + 4); c.lineTo(x, gy + 9); c.lineTo(x - 4, gy + 4); c.closePath(); c.fill();
    }
    if (X(1) > 0) {
      const x = X(0.5), y = gy + 2.5 * lh, s = Math.min(cw, lh) * 0.3;
      c.fillStyle = '#fff'; c.strokeStyle = '#0a0a3c'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(x + s, y); c.lineTo(x - s * 0.8, y - s * 0.8); c.lineTo(x - s * 0.4, y); c.lineTo(x - s * 0.8, y + s * 0.8); c.closePath(); c.fill(); c.stroke();
    }
    if (X(n) < W) {
      const x = X(n), q = lh / 4;
      for (let i = 0; i < gh / q; i++) for (let j = 0; j < 2; j++) { c.fillStyle = (i + j) % 2 ? '#fff' : '#0a0a2e'; c.fillRect(x + j * q, gy + i * q, q, q); }
    }

    if (X(n) + 16 < W && barsOf(lv) < MAX_BARS) {
      const x = X(n) + 16;
      c.fillStyle = 'rgba(255,255,255,.06)';
      c.fillRect(x, gy + 4, ADD_W, gh - 8);
      c.strokeStyle = pal.css; c.lineWidth = 2; c.setLineDash([7, 5]);
      c.strokeRect(x + 1, gy + 5, ADD_W - 2, gh - 10);
      c.setLineDash([]);
      c.fillStyle = '#fff'; c.textAlign = 'center';
      c.font = font(34); c.fillText('+', x + ADD_W / 2, gy + gh / 2 + 4);
      c.font = font(10); c.fillText(this.t('ed.addSection'), x + ADD_W / 2, gy + gh / 2 + 26);
      c.textAlign = 'left';
    }

    // rule hints and the spot where a bot got stuck
    for (const i of this.issues) {
      const x = X(i.row);
      if (x < -cw || x > W) continue;
      const y = gy + i.lane * lh;
      c.fillStyle = '#ffd23a'; c.strokeStyle = '#3a2a00'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(x + cw - 2, y + 2); c.lineTo(x + cw - 2, y + 13); c.lineTo(x + cw - 13, y + 2); c.closePath(); c.fill(); c.stroke();
    }
    if (this.stuckRow >= 0) {
      const x = X(this.stuckRow);
      c.fillStyle = 'rgba(255,40,60,.3)';
      c.fillRect(x, gy, cw, gh);
      c.strokeStyle = '#ff2a3c'; c.lineWidth = 2;
      c.strokeRect(x + 1, gy + 1, cw - 2, gh - 2);
    }

    // minimap: the whole track, with the part in view framed
    if (this.mapDirty) this.drawMap();
    const my = H - MAP;
    c.drawImage(this.map, 0, my, W, MAP);
    const total = n * cw;
    c.fillStyle = '#ffd23a';
    for (const i of this.issues) c.fillRect((i.row / n) * W, my - 3, 2, 3);
    if (this.stuckRow >= 0) { c.fillStyle = '#ff2a3c'; c.fillRect((this.stuckRow / n) * W - 1, my - 4, 3, MAP + 4); }
    c.strokeStyle = '#fff'; c.lineWidth = 1.5;
    const vx = Math.max(0, (this.scroll / total) * W), vw = Math.min(W - vx, (W / total) * W);
    c.fillStyle = 'rgba(255,255,255,.16)';
    c.fillRect(vx, my, Math.max(14, vw), MAP);
    c.lineWidth = 2.5;
    c.strokeRect(vx + 1.25, my + 1.25, Math.max(14, vw) - 2.5, MAP - 2.5);
  }
}
