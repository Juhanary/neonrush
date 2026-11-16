import './style.css';
import { translate, type Key, type Lang } from './i18n';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const GUIDE: [string, string][] = [
  ['\u266A', 'beat'], ['\u25C6', 'gem'], ['\u2197', 'jump'], ['\u25A0', 'block'], ['\u25B3', 'spike'], ['\u25AC', 'air'], ['\u2191', 'pad'], ['\u2192', 'boost'], ['\u25C7', 'ice'],
  ['\u21C4', 'move'], ['\u2551', 'rail'], ['\u21C5', 'flip'], ['\u2605', 'hype'], ['\u25C8', 'prac'], ['\u270E', 'edit'],
];

export interface LevelCard { name: string; world: number; best: number; gems: number; gemTotal: number; done: boolean; stars: number; css: string; css2: string; extreme?: boolean }

/** A track the player built (level editor). */
export interface CustomCard { id: string; name: string; world: number; bpm: number; music: boolean; best: number; gems: number; gemTotal: number; done: boolean; stars: number; css: string; css2: string }

export interface UiHandlers {
  /** Play a track the player built; open the editor on one (or on a new one). */
  playCustom(id: string): void; edit(id?: string): void;
  play(i: number): void; pause(): void; resume(): void; restart(): void; menu(): void; next(): void; mute(): boolean; lang(): void;
  /** Toggle practice mode; returns the new state. */
  mode(): boolean; cpBack(): void; cpStart(): void;
}

/** DOM overlay: HUD, menus and the touch stick indicator. Knows nothing about the simulation. */
export class Ui {
  private hud = $('hud'); private menu = $('menu'); private pauseP = $('pause'); private doneP = $('done');
  private barFill = $('bar').querySelector('i') as HTMLElement;
  private callout = $('callout'); private banner = $('banner'); private danger = $('danger'); private tap = $('tap'); private lastDanger = 0; private bar = $('bar'); private pct = $('pct'); private attempt = $('attempt'); private gems = $('gems'); private hint = $('hint');
  private stick = $('stick'); private nub = this.stick.querySelector('i') as HTMLElement;
  private lastPct = -1; private lastGems = ''; private hintTimer = 0; private lastStars = -1;
  private lang: Lang = 'en'; private muted = false; private attemptN = 1; private practice = false;
  private guideP = $('guide'); private prac = $('prac'); private ticks = $('ticks'); private lastCp = -1;

  constructor(private h: UiHandlers) {
    $('pauseBtn').addEventListener('click', () => h.pause());
    $('resumeBtn').addEventListener('click', () => h.resume());
    $('restartBtn').addEventListener('click', () => h.restart());
    $('againBtn').addEventListener('click', () => h.restart());
    $('quitBtn').addEventListener('click', () => h.menu());
    $('doneMenuBtn').addEventListener('click', () => h.menu());
    $('nextBtn').addEventListener('click', () => h.next());
    const mute = $('muteBtn');
    mute.addEventListener('click', () => this.setMuted(h.mute()));
    $('langBtn').addEventListener('click', () => h.lang());
    $('modeBtn').addEventListener('click', () => h.mode());
    $('editBtn').addEventListener('click', () => h.edit());
    $('cpBackBtn').addEventListener('click', () => h.cpBack());
    $('cpStartBtn').addEventListener('click', () => h.cpStart());
    $('guideBtn').addEventListener('click', () => { this.fillGuide(); this.guideP.hidden = false; this.menu.hidden = true; });
    $('guideBack').addEventListener('click', () => { this.guideP.hidden = true; this.menu.hidden = false; });
    const fs = $('fsBtn');
    const root = document.documentElement;
    if (!root.requestFullscreen) fs.hidden = true;
    fs.addEventListener('click', () => {
      try {
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
        else void root.requestFullscreen().then(() => {
          const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
          void o?.lock?.('landscape').catch(() => {});
        }).catch(() => {});
      } catch { /* not allowed here */ }
    });
  }

  t(key: Key | string): string { return translate(this.lang, key); }

  /** Switch language and refresh every static label. */
  setLang(lang: Lang): void {
    this.lang = lang;
    document.documentElement.lang = lang;
    document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => { el.textContent = this.t(el.dataset.i18n!); });
    this.setMuted(this.muted);
    this.setPractice(this.practice);
    if (!this.guideP.hidden) this.fillGuide();
    this.setAttempt(this.attemptN);
    this.hint.classList.remove('on');
  }

  setMuted(m: boolean): void { this.muted = m; $('muteBtn').textContent = this.t(m ? 'soundOff' : 'soundOn'); }

  private fillGuide(): void {
    $('guideList').innerHTML = GUIDE.map(([icon, k]) => `<div><span>${icon}</span><b>${this.t(`g.${k}.t`)}</b><p>${this.t(`g.${k}.d`)}</p></div>`).join('');
  }

  /** Practice mode on or off: menu button, HUD badge and checkpoint ticks. */
  setPractice(on: boolean): void {
    this.practice = on;
    const b = $('modeBtn');
    b.textContent = this.t(on ? 'practiceOn' : 'practiceOff');
    b.classList.toggle('on', on);
    $('modeNote').hidden = !on;
    this.hudPractice(on);
    document.querySelectorAll('.card').forEach((c) => c.classList.toggle('prac', on));
  }

  /** The HUD of a run that restarts from checkpoints: practice mode, and test drives from the editor. */
  hudPractice(on: boolean, test = false): void {
    const badge = this.prac.querySelector('b')!;
    badge.dataset.i18n = test ? 'ed.testBadge' : 'practice';
    badge.textContent = this.t(badge.dataset.i18n);
    this.prac.hidden = !on;
    this.attempt.hidden = on;
    this.ticks.hidden = !on;
  }

  /** Where "back" leads from the pause and finish panels: the track list, or the editor during a test drive. */
  setBack(key: 'levels' | 'ed.toEditor'): void {
    for (const id of ['quitBtn', 'doneMenuBtn']) { const b = $(id); b.dataset.i18n = key; b.textContent = this.t(key); }
  }

  /** Everything of the game's own interface out of the way: the editor has the screen. */
  showEditor(): void {
    this.menu.hidden = true; this.hud.hidden = true; this.pauseP.hidden = true; this.doneP.hidden = true; this.guideP.hidden = true;
    this.hint.classList.remove('on');
  }

  /** Checkpoint ticks on the progress bar: positions are 0..1, `current` is the one the next run starts from. */
  setCheckpoints(at: number[], current: number): void {
    if (this.ticks.childElementCount !== at.length) {
      this.ticks.innerHTML = at.map((f) => `<i style="left:${(f * 100).toFixed(2)}%"></i>`).join('');
      this.lastCp = -1;
    }
    if (current === this.lastCp) return;
    this.lastCp = current;
    [...this.ticks.children].forEach((el, i) => { el.classList.toggle('on', i < current); el.classList.toggle('cur', i === current); });
  }

  setTheme(css: string, css2: string): void {
    document.documentElement.style.setProperty('--a', css);
    document.documentElement.style.setProperty('--b', css2);
  }

  /** The player's totals in the corner of the menu. The numbers pop when they have grown since they were last shown. */
  setStats(st: { stars: number; starMax: number; coins: number; attempts: number }): void {
    $('psStars').textContent = String(st.stars);
    $('psStarMax').textContent = '/' + st.starMax;
    $('psCoins').textContent = String(st.coins);
    $('psTries').textContent = String(st.attempts);
    const box = $('pstats');
    box.classList.remove('bump');
    if (this.lastStars >= 0 && st.stars > this.lastStars) { void box.offsetWidth; box.classList.add('bump'); }
    this.lastStars = st.stars;
  }

  showMenu(cards: LevelCard[], custom: CustomCard[] = []): void {
    const box = $('levels');
    box.textContent = '';
    cards.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = this.practice ? 'card prac' : 'card';
      b.style.setProperty('--c1', c.css);
      b.style.setProperty('--c2', c.css2);
      b.innerHTML = `<span class="go">${c.done ? '&#9733;' : '&#9654;'}</span><small>${this.t('world')} ${c.world + 1}${c.extreme ? ` <em class="ex">${this.t('extreme')}</em>` : ''}</small><strong>${c.name}</strong>
        <div class="meter"><i style="width:${c.best}%"></i></div>
        <div class="meta"><span>${c.best}%</span><span class="st">${'&#9733;'.repeat(c.stars)}<u>${'&#9733;'.repeat(3 - c.stars)}</u></span><span>&#9670; ${c.gems}/${c.gemTotal}</span></div>`;
      b.addEventListener('click', () => this.h.play(i));
      box.appendChild(b);
    });
    // the player's own tracks, and the way into the editor
    for (const c of custom) {
      const b = document.createElement('button');
      b.className = this.practice ? 'card mine prac' : 'card mine';
      b.style.setProperty('--c1', c.css);
      b.style.setProperty('--c2', c.css2);
      b.innerHTML = `<span class="pen" aria-label="Edit">&#9998;</span><small>${this.t('myTrack')} &middot; ${c.bpm} BPM${c.music ? ' &#9834;' : ''}</small><strong></strong>
        <div class="meter"><i style="width:${c.best}%"></i></div>
        <div class="meta"><span>${c.best}%</span><span class="st">${'&#9733;'.repeat(c.stars)}<u>${'&#9733;'.repeat(3 - c.stars)}</u></span><span>&#9670; ${c.gems}/${c.gemTotal}</span></div>`;
      b.querySelector('strong')!.textContent = c.name;
      b.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('.pen')) this.h.edit(c.id); else this.h.playCustom(c.id); });
      box.appendChild(b);
    }
    const add = document.createElement('button');
    add.className = 'card new';
    add.id = 'newTrack';
    add.style.setProperty('--c1', 'var(--a)');
    add.textContent = this.t('newTrack');
    add.addEventListener('click', () => this.h.edit());
    box.appendChild(add);
    this.menu.hidden = false; this.hud.hidden = true; this.pauseP.hidden = true; this.doneP.hidden = true; this.guideP.hidden = true;
    this.hint.classList.remove('on');
  }

  showPlay(): void {
    this.menu.hidden = true; this.pauseP.hidden = true; this.doneP.hidden = true; this.hud.hidden = false;
  }
  showPause(): void { this.pauseP.hidden = false; }
  showDone(stats: { attempts: number; gems: number; gemTotal: number; stars: number; hasNext: boolean; practice: boolean; test?: boolean; /** Coins this run earned. */ coins?: number }): void {
    document.querySelectorAll('#stars span').forEach((el, i) => el.classList.toggle('on', i < stats.stars));
    $('stars').hidden = stats.practice;
    $('doneTitle').textContent = this.t(stats.test ? 'ed.testDone' : stats.practice ? 'practiceDone' : 'complete');
    $('doneNote').textContent = this.t(stats.test ? 'ed.testNote' : stats.practice ? 'practiceNote' : 'starRule');
    $('againBtn').textContent = this.t(stats.practice && !stats.test ? 'playReal' : 'again');
    $('doneStats').innerHTML = `${this.t('attempts')} <b>${stats.attempts}</b><br>${this.t('gems')} <b>&#9670; ${stats.gems}/${stats.gemTotal}</b>`
      + (stats.coins ? `<br>${this.t('coins')} <b class="gain"><i class="coinIcon"></i> +${stats.coins}</b>` : '');
    $('nextBtn').hidden = !stats.hasNext;
    this.doneP.hidden = false; this.hud.hidden = true;
  }

  setHud(progress: number, gems: number, gemTotal: number): void {
    const p = Math.max(0, Math.min(100, Math.floor(progress * 100)));
    if (p !== this.lastPct) {
      this.lastPct = p;
      this.pct.textContent = p + '%';
      this.barFill.style.transform = `scaleX(${p / 100})`;
    }
    const g = `◆ ${gems}/${gemTotal}`;
    if (g !== this.lastGems) { this.lastGems = g; this.gems.textContent = g; }
  }
  setAttempt(n: number): void { this.attemptN = n; this.attempt.textContent = this.t('attempt') + ' ' + n; }

  showHint(touch: boolean): void {
    this.hint.innerHTML = touch
      ? `<b>&#9664; ${this.t('touchSteer')} &#9654;</b><b>${this.t('touchJump')}</b>`
      : `<b>${this.t('keySteer')}</b><b>${this.t('keyJump')}</b>`;
    this.hint.classList.add('on');
    clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => this.hint.classList.remove('on'), 4500);
  }

  /** Big mid-screen tutorial text. */
  showCallout(text: string): void {
    const c = this.callout;
    c.textContent = text;
    this.hideBanner();
    c.classList.remove('on');
    void c.offsetWidth; // restart the animation
    c.classList.add('on');
  }
  hideCallout(): void { this.callout.classList.remove('on'); }

  /** Big celebratory text. `hold` keeps it on screen until hideBanner(). */
  showBanner(text: string, hold = false): void {
    const b = this.banner;
    b.textContent = text;
    this.hideCallout();
    b.classList.remove('on', 'hold');
    void b.offsetWidth;
    b.classList.add(hold ? 'hold' : 'on');
  }
  hideBanner(): void { this.banner.classList.remove('on', 'hold'); }
  /** Gravity-flip feedback: the tap prompt, and a red vignette that grows near the ceiling (0..1). */
  setFlip(active: boolean, danger: number): void {
    this.tap.classList.toggle('on', active);
    const d = active ? Math.round(danger * 20) / 20 : 0;
    if (d !== this.lastDanger) { this.lastDanger = d; this.danger.style.opacity = String(d); }
  }

  /** Progress bar mood: 0 normal, 1 past halfway, 2 record run. */
  setHype(h: number): void {
    this.bar.classList.toggle('half', h === 1);
    this.bar.classList.toggle('rec', h >= 2);
  }

  setStick(active: boolean, x: number, y: number, dx: number): void {
    this.stick.classList.toggle('on', active);
    if (!active) return;
    this.stick.style.left = x + 'px';
    this.stick.style.top = y + 'px';
    this.nub.style.transform = `translateX(${dx}px)`;
  }
}
