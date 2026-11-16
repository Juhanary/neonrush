import { GameAudio, type MusicTrack } from '../audio/audio';
import { BEAT_LEN, CFG } from '../core/config';
import { CUSTOM_PREFIX, toDef, type CustomLevel } from '../core/custom';
import { Level, isGem } from '../core/level';
import { LEVELS } from '../core/levels';
import { Sim, type ShipState } from '../core/sim';
import { PALETTES } from '../render/palette';
import { View, type Pose } from '../render/view';
import { Editor } from '../editor/editor';
import { detectLang } from '../ui/i18n';
import { Ui } from '../ui/ui';
import { CustomStore } from './custom-store';
import { Input } from './input';
import { coinsFor, playerStats } from './profile';
import { loadSave, storeSave } from './storage';
import { Tracks } from './tracks';

type Mode = 'menu' | 'play' | 'dead' | 'done' | 'pause' | 'edit';
const RESPAWN = 0.62;

/** Glue: fixed-step loop, mode changes, and routing sim events to view / audio / UI. */
export class Game {
  private levels = LEVELS.map((d) => new Level(d));
  private idx = 0;
  private sim: Sim;
  private prev: ShipState;
  private mode: Mode = 'menu';
  private acc = 0;
  private last = 0;
  private clock = 0;
  private timer = 0;
  private doneShown = false;
  private coast = 0;
  private attempts = 0;
  /** Coins the run that just finished earned. */
  private gained = 0;
  private save = loadSave();
  private audio = new GameAudio();
  private input = new Input();
  private ui: Ui;
  private touch = false;
  private nextHint = 0;
  private prevBest = 0;
  private hype = 0;
  private fire = 0;
  /** Practice mode: runs restart from checkpoint `cp`; `hold` is the short freeze after such a restart. */
  private practice = false;
  private cp = 0;
  private hold = 0;
  /** Clock value at which the free-running menu theme started. */
  private menuT0 = 0;
  /** The player's own tracks (level editor), and the one that is loaded when it is not an official track. */
  private store = new CustomStore();
  private tracks = new Tracks(this.store, this.audio);
  private editor: Editor;
  private custom?: { data: CustomLevel; level: Level; /** A test drive from the editor: nothing is recorded and "back" returns there. */ test: boolean; track?: MusicTrack };
  /** Bumped whenever something else is started, so a track whose music was still loading does not start late. */
  private loading = 0;

  /** The track that is loaded. */
  private get lvl(): Level { return this.custom?.level ?? this.levels[this.idx]; }
  /** Runs restart from checkpoints: practice mode, and every test drive from the editor. */
  private get prac(): boolean { return this.practice || !!this.custom?.test; }

  constructor(private view: View, surface: HTMLElement) {
    this.sim = new Sim(this.levels[0]);
    this.prev = { ...this.sim.s };
    this.audio.muted = this.save.muted;
    this.ui = new Ui({
      play: (i) => this.start(i),
      pause: () => this.pause(),
      resume: () => this.resume(),
      restart: () => {
        this.audio.unlock(); this.audio.resume();
        // "play for real" after a practice run
        if (this.mode === 'done' && this.practice && !this.custom?.test) this.setPractice(false);
        this.ui.showPlay(); this.respawn();
      },
      mode: () => { this.setPractice(!this.practice); if (this.mode === 'menu') this.toMenu(); return this.practice; },
      cpBack: () => this.jumpTo(Math.max(0, this.cp - 1)),
      cpStart: () => this.jumpTo(0),
      menu: () => { if (this.custom?.test) this.toEditor(this.custom.data.id, Math.floor(this.sim.s.z / CFG.tileL)); else this.toMenu(); },
      playCustom: (id) => void this.playCustom(id),
      edit: (id) => this.toEditor(id),
      next: () => this.start(Math.min(this.idx + 1, this.levels.length - 1)),
      mute: () => {
        this.audio.unlock();
        this.save.muted = !this.save.muted;
        this.audio.setMuted(this.save.muted);
        storeSave(this.save);
        return this.save.muted;
      },
      lang: () => {
        this.save.lang = (this.save.lang ?? detectLang()) === 'fi' ? 'en' : 'fi';
        storeSave(this.save);
        this.ui.setLang(this.save.lang);
        if (this.mode === 'menu') this.toMenu();
      },
    });
    this.editor = new Editor({
      store: this.store, tracks: this.tracks, audio: this.audio,
      t: (key) => this.ui.t(key),
      test: (level, row) => void this.playCustom(level.id, true, row),
      exit: () => this.toMenu(),
      changed: (id) => this.forget(CUSTOM_PREFIX + id),
    });
    this.ui.setMuted(this.save.muted);
    this.ui.setLang(this.save.lang ?? detectLang());
    this.practice = !!this.save.practiceOn;
    this.ui.setPractice(this.practice);
    this.input.attach(surface);
    this.input.onStick = (a, x, y, dx) => this.ui.setStick(a, x, y, dx);
    surface.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') this.touch = true; });
    // browsers only allow sound after a touch: the first one anywhere starts the menu theme
    window.addEventListener('pointerdown', () => {
      if (this.audio.ready) return;
      this.audio.unlock();
      if (this.mode === 'menu') this.menuMusic();
    }, true);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' || e.code === 'KeyP') { if (this.mode === 'pause') this.resume(); else this.pause(); }
      if (e.code === 'KeyR' && (this.mode === 'play' || this.mode === 'dead')) this.respawn();
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); });
    window.addEventListener('resize', () => this.view.resize());
    this.loadLevel(0);
    this.toMenu();
    requestAnimationFrame((t) => { this.last = t; this.loop(t); });
  }

  private loadLevel(i: number): void {
    this.idx = i;
    this.custom = undefined;
    this.show(this.levels[i]);
  }

  private show(level: Level): void {
    const pal = PALETTES[level.def.world % PALETTES.length];
    this.sim = new Sim(level);
    this.prev = { ...this.sim.s };
    this.view.loadLevel(level, pal);
    this.ui.setTheme(pal.css, pal.css2);
  }

  /** Records of a track that was edited or deleted no longer mean anything. */
  private forget(id: string): void {
    for (const k of ['best', 'gems', 'done', 'stars', 'practice'] as const) delete this.save[k][id];
    storeSave(this.save);
  }

  /** Open the level editor on a stored track, or on a new one. `row` is where to look (back from a test drive). */
  private toEditor(id?: string, row?: number): void {
    this.loading++;
    this.audio.unlock();
    this.audio.resume();
    this.audio.stopMusic();
    this.mode = 'edit';
    this.input.clear();
    this.ui.hideCallout();
    this.ui.hideBanner();
    this.ui.setFlip(false, 0);
    this.ui.setHype(0);
    this.ui.showEditor();
    this.editor.open(id, row);
  }

  /**
   * Play a track from the editor: from the menu like any other, or as a test drive that starts at the
   * checkpoint at or before `row`, restarts from checkpoints and records nothing.
   */
  private async playCustom(id: string, test = false, row = 0): Promise<void> {
    const data = this.store.get(id);
    if (!data) return;
    this.audio.unlock();
    const token = ++this.loading;
    let track: MusicTrack | undefined;
    if (data.music) {
      // decoding a song takes a moment the first time
      this.ui.showBanner(this.ui.t('ed.loading'), true);
      track = await this.tracks.track(data);
      this.ui.hideBanner();
      if (token !== this.loading) return;
    }
    const level = new Level(toDef(data));
    this.custom = { data, level, test, track };
    this.show(level);
    this.cp = 0;
    const from = test ? row : this.practice ? this.save.practice[level.def.id] ?? 0 : 0;
    level.checkpoints.forEach((c, k) => { if (c.row <= from) this.cp = k; });
    this.view.setPractice(this.prac);
    this.ui.hudPractice(this.prac, test);
    this.ui.setBack(test ? 'ed.toEditor' : 'levels');
    this.attempts = 0;
    this.ui.showPlay();
    this.respawn();
    this.ui.showHint(this.touch || matchMedia('(pointer: coarse)').matches);
  }

  /** The menu theme runs on the clock instead of on a track. */
  private menuMusic(): void {
    if (this.audio.current === 'menu') return;
    this.menuT0 = this.clock;
    this.audio.playSong('menu');
  }

  private toMenu(): void {
    this.loading++;
    this.mode = 'menu';
    this.audio.resume();
    this.menuMusic();
    this.sim.reset();
    this.prev = { ...this.sim.s };
    this.view.resetRun();
    this.ui.hideCallout();
    this.ui.hideBanner();
    this.ui.setFlip(false, 0);
    this.ui.setHype(0);
    this.ui.setStats(playerStats(this.save, this.levels.map((l) => l.def.id)));
    this.ui.showMenu(this.levels.map((l) => {
      const pal = PALETTES[l.def.world % PALETTES.length];
      return {
        name: l.def.name, world: l.def.world, best: Math.round(this.save.best[l.def.id] ?? 0),
        gems: this.save.gems[l.def.id] ?? 0, gemTotal: l.gemCount, done: !!this.save.done[l.def.id], stars: this.save.stars[l.def.id] ?? 0, css: pal.css, css2: pal.css2, extreme: l.def.extreme,
      };
    }), this.store.list().map((c) => {
      const pal = PALETTES[c.world % PALETTES.length], id = CUSTOM_PREFIX + c.id;
      let gemTotal = 0;
      for (const r of c.rows) for (const ch of r) if (isGem(ch)) gemTotal++;
      return {
        id: c.id, name: c.name, world: c.world, bpm: Math.round(c.speed * 5), music: !!c.music, best: Math.round(this.save.best[id] ?? 0),
        gems: this.save.gems[id] ?? 0, gemTotal, done: !!this.save.done[id], stars: this.save.stars[id] ?? 0, css: pal.css, css2: pal.css2,
      };
    }));
  }

  private setPractice(on: boolean): void {
    this.practice = on;
    this.save.practiceOn = on;
    storeSave(this.save);
    this.ui.setPractice(on);
    this.view.setPractice(on);
  }

  /** Practice: move the restart point and restart from it. */
  private jumpTo(cp: number): void {
    if (!this.prac || (this.mode !== 'play' && this.mode !== 'dead')) return;
    this.cp = cp;
    this.storeCp();
    this.respawn();
  }

  private storeCp(): void {
    if (this.custom?.test) return;
    const level = this.lvl;
    this.save.practice[level.def.id] = level.checkpoints[this.cp].row;
    storeSave(this.save);
  }

  private start(i: number): void {
    this.loading++;
    this.audio.unlock();
    if (i !== this.idx || this.mode === 'menu') this.loadLevel(i);
    // practice picks up at the checkpoint saved for this track
    const level = this.levels[i];
    const row = this.save.practice[level.def.id] ?? 0;
    this.cp = 0;
    level.checkpoints.forEach((c, k) => { if (c.row <= row) this.cp = k; });
    this.view.setPractice(this.practice);
    this.ui.hudPractice(this.practice);
    this.ui.setBack('levels');
    this.attempts = 0;
    this.ui.showPlay();
    this.respawn();
    this.ui.showHint(this.touch || matchMedia('(pointer: coarse)').matches);
  }

  private respawn(): void {
    const lvl = this.lvl;
    if (this.prac) {
      this.sim.spawnAt(lvl.checkpoints[this.cp]);
      this.hold = this.cp > 0 ? 0.55 : 0;
    } else {
      this.sim.reset();
      this.hold = 0;
    }
    this.prev = { ...this.sim.s };
    this.acc = 0;
    this.doneShown = false;
    this.coast = 0;
    this.nextHint = 0;
    const hints = lvl.def.hints ?? [];
    while (this.nextHint < hints.length && hints[this.nextHint].row < this.sim.s.z / CFG.tileL) this.nextHint++;
    this.ui.hideCallout();
    this.ui.hideBanner();
    this.ui.setFlip(false, 0);
    this.setHype(0);
    this.prevBest = this.save.best[this.lvl.def.id] ?? 0;
    this.input.clear();
    this.view.resetRun();
    if (this.prac) {
      this.view.checkpoint(this.pose(1));
      this.ui.setCheckpoints(lvl.checkpoints.slice(1).map((c) => c.z / lvl.finishZ), this.cp - 1);
      if (this.hold > 0) this.ui.showCallout(this.ui.t('ready'));
    }
    this.attempts++;
    const id = this.lvl.def.id;
    // every run counts, practice too; a test drive from the editor is not a run
    if (!this.custom?.test) { this.save.attempts[id] = (this.save.attempts[id] ?? 0) + 1; storeSave(this.save); }
    this.ui.setAttempt(this.attempts);
    this.ui.setHud(0, 0, this.lvl.gemCount);
    // the song starts at the beat the ship stands on, so a checkpoint restart resumes mid-song
    this.audio.playSong(lvl.def.song, { energy: (bar) => lvl.energyOf(bar), from: lvl.beatAt(this.sim.s.z), muffled: this.sim.s.flip, track: this.custom?.track });
    this.mode = 'play';
  }

  private setHype(h: number): void {
    this.hype = h;
    this.view.setHype(h);
    this.audio.hype = h;
    this.ui.setHype(h);
  }

  /** Rewards for progress within a run: halfway, then beating the stored record. */
  private milestones(): void {
    if (this.prac) {
      // practice has checkpoints instead of rewards
      const k = this.lvl.checkpointAt(this.sim.s.z);
      if (k > this.cp && this.sim.s.alive) {
        this.cp = k;
        this.storeCp();
        this.audio.checkpoint();
        this.view.checkpoint(this.pose(1));
        const lvl = this.lvl;
        this.ui.setCheckpoints(lvl.checkpoints.slice(1).map((c) => c.z / lvl.finishZ), this.cp - 1);
      }
      return;
    }
    const pct = (this.sim.s.z / this.lvl.finishZ) * 100;
    if (this.hype < 1 && pct >= 50) {
      this.setHype(1);
      this.view.milestone('half', this.pose(1));
      this.audio.milestone('half');
      this.ui.showBanner(this.ui.t('half'));
    }
    if (this.hype < 2 && this.prevBest >= 5 && this.prevBest < 100 && pct > this.prevBest + 0.5) {
      this.setHype(2);
      this.view.milestone('record', this.pose(1));
      this.audio.milestone('record');
      this.ui.showBanner(this.ui.t('record'));
    }
  }

  private pause(): void {
    if (this.mode !== 'play') return;
    this.mode = 'pause';
    this.audio.suspend();
    this.ui.showPause();
  }

  private resume(): void {
    if (this.mode !== 'pause') return;
    this.audio.resume();
    this.ui.showPlay();
    this.input.clear();
    this.acc = 0;
    this.mode = 'play';
  }

  private pose(alpha: number): Pose {
    const a = this.prev, b = this.sim.s;
    const L = (u: number, v: number) => u + (v - u) * alpha;
    return {
      x: L(a.x, b.x), y: L(a.y, b.y), z: L(a.z, b.z) + this.coast, vx: b.vx, vy: b.vy, speed: b.speed,
      grounded: b.grounded, boosting: b.boost > 0, alive: b.alive && !b.finished,
      t: this.lvl.beatAt(L(a.z, b.z)), flip: b.flip,
    };
  }

  private drainEvents(): void {
    const s = this.sim.s;
    const level = this.lvl;
    const id = level.def.id;
    for (const e of this.sim.events) {
      this.view.onEvent(e, this.pose(1));
      this.audio.onEvent(e);
      if (e.type === 'flipOn') this.ui.showBanner(this.ui.t('flipOn'));
      else if (e.type === 'flipOff') this.ui.showBanner(this.ui.t('flipOff'));
      if (e.type === 'crash' || e.type === 'fall' || e.type === 'fly') {
        this.mode = 'dead';
        this.timer = RESPAWN;
        this.audio.stopMusic();
        this.input.clear();
        const pct = Math.min(99, Math.floor((s.z / level.finishZ) * 100));
        if (!this.prac && pct > (this.save.best[id] ?? 0)) {
          this.save.best[id] = pct;
          storeSave(this.save);
          if (pct >= 5) { this.ui.showBanner(`${this.ui.t('record')} ${pct}%`, true); this.timer = 1.25; }
        }
      } else if (e.type === 'finish') {
        this.audio.stopMusic();
        this.mode = 'done';
        this.timer = 1.1;
        if (this.prac) {
          // a practice run earns nothing; the next one starts from the beginning again
          this.cp = 0;
          this.save.practice[id] = 0;
        } else {
          this.save.best[id] = 100;
          this.save.done[id] = true;
          this.save.gems[id] = Math.max(this.save.gems[id] ?? 0, this.sim.collected.size);
          const had = this.save.stars[id] ?? 0;
          this.save.stars[id] = Math.max(had, this.stars());
          // only official tracks pay
          this.gained = this.custom ? 0 : coinsFor(this.save.stars[id] - had);
        }
        this.fire = 0;
        this.ui.hideBanner();
        storeSave(this.save);
      }
    }
    this.sim.events.length = 0;
  }

  private stars(): number {
    const got = this.sim.collected.size, total = this.lvl.gemCount;
    return 1 + (got * 2 >= total ? 1 : 0) + (got >= total ? 1 : 0);
  }

  private loop = (now: number): void => {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    // the editor has the screen to itself: nothing is simulated or drawn behind it
    if (this.mode === 'pause' || this.mode === 'edit') return;
    this.clock += dt;

    if (this.mode === 'play') {
      if (this.hold > 0) {
        // frozen for a moment after a checkpoint restart, so the road ahead can be read
        this.hold -= dt;
        this.acc = 0;
        if (this.hold <= 0) { this.input.clear(); this.ui.hideCallout(); }
      } else this.acc += dt;
      while (this.acc >= CFG.dt && this.mode === 'play') {
        this.prev = { ...this.sim.s };
        this.sim.step(this.input.sample());
        this.acc -= CFG.dt;
        this.drainEvents();
      }
      if (this.mode === 'play') this.milestones();
      const fs = this.sim.s;
      const danger = fs.flip && fs.alive ? Math.max(0, Math.min(1, (fs.y - (CFG.flipCeil - 3)) / 3)) : 0;
      this.ui.setFlip(fs.flip && this.mode === 'play', danger);
      if (danger > 0.45) this.audio.warn(danger);
      const def = this.lvl.def;
      if (def.hints && (this.prac || !this.save.done[def.id])) {
        const row = this.sim.s.z / CFG.tileL;
        while (this.nextHint < def.hints.length && row >= def.hints[this.nextHint].row) {
          if (this.mode === 'play') this.ui.showCallout(this.ui.t('hint.' + def.hints[this.nextHint].key));
          this.nextHint++;
        }
      }
      this.ui.setHud(this.sim.s.z / this.lvl.finishZ, this.sim.collected.size, this.lvl.gemCount);
    } else if (this.mode === 'dead') {
      this.timer -= dt;
      const skip = this.input.tapped && this.timer < RESPAWN - 0.18;
      this.input.tapped = false;
      if (this.timer <= 0 || skip) this.respawn();
    } else if (this.mode === 'done') {
      this.timer -= dt;
      this.coast += this.sim.s.speed * dt * Math.max(0.15, this.timer);
      this.fire -= dt;
      if (this.fire <= 0) { this.fire = 0.22 + Math.random() * 0.2; this.view.firework(); }
      if (this.timer <= 0 && !this.doneShown) {
        this.doneShown = true;
        this.menuMusic();
        this.ui.showDone({
          attempts: this.attempts, gems: this.sim.collected.size, gemTotal: this.lvl.gemCount, stars: this.stars(),
          hasNext: !this.custom && this.idx < this.levels.length - 1, practice: this.prac, test: this.custom?.test, coins: this.prac ? 0 : this.gained,
        });
      }
    }

    if (this.mode !== 'play') this.ui.setFlip(false, 0);
    const playing = this.mode === 'play';
    const alpha = playing ? this.acc / CFG.dt : 1;
    const pose = this.pose(alpha);
    // one beat position drives the music, the pulse of the visuals and the moving roads
    let beatPos: number;
    if (this.audio.current === 'menu') {
      const bps = this.audio.bpmOf('menu') / 60;
      beatPos = (this.clock - this.menuT0) * bps;
      this.audio.sync(beatPos, bps);
    } else {
      beatPos = pose.t;
      if (playing) this.audio.sync(beatPos, this.hold > 0 ? 0 : this.sim.s.speed / BEAT_LEN);
    }
    const phase = beatPos - Math.floor(beatPos);
    const downbeat = Math.floor(beatPos) % CFG.beatsPerBar === 0;
    const beat = this.mode === 'dead' || beatPos < 0 ? 0 : Math.exp(-phase * 4.5) * (downbeat ? 1 : 0.7);
    this.view.frame(dt, pose, this.clock, beat, this.mode === 'menu');
  };
}
