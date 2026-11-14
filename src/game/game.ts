import { GameAudio } from '../audio/audio';
import { CFG } from '../core/config';
import { Level } from '../core/level';
import { LEVELS } from '../core/levels';
import { Sim, type ShipState } from '../core/sim';
import { PALETTES } from '../render/palette';
import { View, type Pose } from '../render/view';
import { Ui } from '../ui/ui';
import { Input } from './input';
import { loadSave, storeSave } from './storage';

type Mode = 'menu' | 'play' | 'dead' | 'done' | 'pause';
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
  private save = loadSave();
  private audio = new GameAudio();
  private input = new Input();
  private ui: Ui;
  private touch = false;
  private nextHint = 0;

  constructor(private view: View, surface: HTMLElement) {
    this.sim = new Sim(this.levels[0]);
    this.prev = { ...this.sim.s };
    this.audio.muted = this.save.muted;
    this.ui = new Ui({
      play: (i) => this.start(i),
      pause: () => this.pause(),
      resume: () => this.resume(),
      restart: () => { this.audio.unlock(); this.audio.resume(); this.ui.showPlay(); this.respawn(); },
      menu: () => this.toMenu(),
      next: () => this.start(Math.min(this.idx + 1, this.levels.length - 1)),
      mute: () => {
        this.audio.unlock();
        this.save.muted = !this.save.muted;
        this.audio.setMuted(this.save.muted);
        storeSave(this.save);
        return this.save.muted;
      },
    });
    this.ui.setMuted(this.save.muted);
    this.input.attach(surface);
    this.input.onStick = (a, x, y, dx) => this.ui.setStick(a, x, y, dx);
    surface.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') this.touch = true; });
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
    const level = this.levels[i];
    const pal = PALETTES[level.def.world % PALETTES.length];
    this.sim = new Sim(level);
    this.prev = { ...this.sim.s };
    this.view.loadLevel(level, pal);
    this.ui.setTheme(pal.css, pal.css2);
  }

  private toMenu(): void {
    this.mode = 'menu';
    this.audio.stopMusic();
    this.sim.reset();
    this.prev = { ...this.sim.s };
    this.view.resetRun();
    this.ui.hideCallout();
    this.ui.showMenu(this.levels.map((l) => {
      const pal = PALETTES[l.def.world % PALETTES.length];
      return {
        name: l.def.name, world: l.def.world, best: Math.round(this.save.best[l.def.id] ?? 0),
        gems: this.save.gems[l.def.id] ?? 0, gemTotal: l.gemCount, done: !!this.save.done[l.def.id], css: pal.css, css2: pal.css2,
      };
    }));
  }

  private start(i: number): void {
    this.audio.unlock();
    if (i !== this.idx || this.mode === 'menu') this.loadLevel(i);
    this.attempts = 0;
    this.ui.showPlay();
    this.respawn();
    this.ui.showHint(this.touch || matchMedia('(pointer: coarse)').matches);
  }

  private respawn(): void {
    this.sim.reset();
    this.prev = { ...this.sim.s };
    this.acc = 0;
    this.doneShown = false;
    this.coast = 0;
    this.nextHint = 0;
    this.ui.hideCallout();
    this.input.clear();
    this.view.resetRun();
    this.attempts++;
    const id = this.levels[this.idx].def.id;
    this.save.attempts[id] = (this.save.attempts[id] ?? 0) + 1;
    this.ui.setAttempt(this.attempts);
    this.ui.setHud(0, 0, this.levels[this.idx].gemCount);
    this.audio.startMusic(this.levels[this.idx].def.world);
    this.mode = 'play';
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
    };
  }

  private drainEvents(): void {
    const s = this.sim.s;
    const level = this.levels[this.idx];
    const id = level.def.id;
    for (const e of this.sim.events) {
      this.view.onEvent(e, this.pose(1));
      this.audio.onEvent(e);
      if (e.type === 'crash' || e.type === 'fall') {
        this.mode = 'dead';
        this.timer = RESPAWN;
        this.audio.stopMusic();
        this.input.clear();
        const pct = Math.min(99, Math.floor((s.z / level.finishZ) * 100));
        if (pct > (this.save.best[id] ?? 0)) { this.save.best[id] = pct; storeSave(this.save); }
      } else if (e.type === 'finish') {
        this.mode = 'done';
        this.timer = 1.1;
        this.save.best[id] = 100;
        this.save.done[id] = true;
        this.save.gems[id] = Math.max(this.save.gems[id] ?? 0, this.sim.collected.size);
        storeSave(this.save);
      }
    }
    this.sim.events.length = 0;
  }

  private loop = (now: number): void => {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (this.mode === 'pause') return;
    this.clock += dt;

    if (this.mode === 'play') {
      this.acc += dt;
      while (this.acc >= CFG.dt && this.mode === 'play') {
        this.prev = { ...this.sim.s };
        this.sim.step(this.input.sample());
        this.acc -= CFG.dt;
        this.drainEvents();
      }
      const def = this.levels[this.idx].def;
      if (def.hints && !this.save.done[def.id]) {
        const row = this.sim.s.z / CFG.tileL;
        while (this.nextHint < def.hints.length && row >= def.hints[this.nextHint].row) {
          if (this.mode === 'play') this.ui.showCallout(def.hints[this.nextHint].text);
          this.nextHint++;
        }
      }
      this.ui.setHud(this.sim.s.z / this.levels[this.idx].finishZ, this.sim.collected.size, this.levels[this.idx].gemCount);
    } else if (this.mode === 'dead') {
      this.timer -= dt;
      const skip = this.input.tapped && this.timer < RESPAWN - 0.18;
      this.input.tapped = false;
      if (this.timer <= 0 || skip) this.respawn();
    } else if (this.mode === 'done') {
      this.timer -= dt;
      this.coast += this.sim.s.speed * dt * Math.max(0.15, this.timer);
      if (this.timer <= 0 && !this.doneShown) {
        this.doneShown = true;
        this.audio.stopMusic();
        this.ui.showDone({
          attempts: this.attempts, gems: this.sim.collected.size, gemTotal: this.levels[this.idx].gemCount,
          hasNext: this.idx < this.levels.length - 1,
        });
      }
    }

    this.audio.update();
    const playing = this.mode === 'play';
    const t = this.mode === 'menu' ? this.clock : this.sim.s.time;
    const phase = (t * CFG.bpm / 60) % 1;
    const beat = this.mode === 'dead' ? 0 : Math.exp(-phase * 4.5);
    const alpha = playing ? this.acc / CFG.dt : 1;
    this.view.frame(dt, this.pose(alpha), this.clock, beat, this.mode === 'menu');
  };
}
