import './style.css';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export interface LevelCard { name: string; world: number; best: number; gems: number; gemTotal: number; done: boolean; css: string; css2: string }

export interface UiHandlers {
  play(i: number): void; pause(): void; resume(): void; restart(): void; menu(): void; next(): void; mute(): boolean;
}

/** DOM overlay: HUD, menus and the touch stick indicator. Knows nothing about the simulation. */
export class Ui {
  private hud = $('hud'); private menu = $('menu'); private pauseP = $('pause'); private doneP = $('done');
  private barFill = $('bar').querySelector('i') as HTMLElement;
  private pct = $('pct'); private attempt = $('attempt'); private gems = $('gems'); private hint = $('hint');
  private stick = $('stick'); private nub = this.stick.querySelector('i') as HTMLElement;
  private lastPct = -1; private lastGems = ''; private hintTimer = 0;

  constructor(private h: UiHandlers) {
    $('pauseBtn').addEventListener('click', () => h.pause());
    $('resumeBtn').addEventListener('click', () => h.resume());
    $('restartBtn').addEventListener('click', () => h.restart());
    $('againBtn').addEventListener('click', () => h.restart());
    $('quitBtn').addEventListener('click', () => h.menu());
    $('doneMenuBtn').addEventListener('click', () => h.menu());
    $('nextBtn').addEventListener('click', () => h.next());
    const mute = $('muteBtn');
    mute.addEventListener('click', () => { mute.textContent = h.mute() ? 'SOUND OFF' : 'SOUND ON'; });
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

  setMuted(m: boolean): void { $('muteBtn').textContent = m ? 'SOUND OFF' : 'SOUND ON'; }

  setTheme(css: string, css2: string): void {
    document.documentElement.style.setProperty('--a', css);
    document.documentElement.style.setProperty('--b', css2);
  }

  showMenu(cards: LevelCard[]): void {
    const box = $('levels');
    box.textContent = '';
    cards.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'card';
      b.style.setProperty('--c1', c.css);
      b.style.setProperty('--c2', c.css2);
      b.innerHTML = `<span class="go">${c.done ? '&#9733;' : '&#9654;'}</span><small>WORLD ${c.world + 1}</small><strong>${c.name}</strong>
        <div class="meter"><i style="width:${c.best}%"></i></div>
        <div class="meta"><span>${c.best}%</span><span>&#9670; ${c.gems}/${c.gemTotal}</span></div>`;
      b.addEventListener('click', () => this.h.play(i));
      box.appendChild(b);
    });
    this.menu.hidden = false; this.hud.hidden = true; this.pauseP.hidden = true; this.doneP.hidden = true;
    this.hint.classList.remove('on');
  }

  showPlay(): void {
    this.menu.hidden = true; this.pauseP.hidden = true; this.doneP.hidden = true; this.hud.hidden = false;
  }
  showPause(): void { this.pauseP.hidden = false; }
  showDone(stats: { attempts: number; gems: number; gemTotal: number; hasNext: boolean }): void {
    $('doneStats').innerHTML = `ATTEMPTS <b>${stats.attempts}</b><br>GEMS <b>&#9670; ${stats.gems}/${stats.gemTotal}</b>`;
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
  setAttempt(n: number): void { this.attempt.textContent = 'ATTEMPT ' + n; }

  showHint(touch: boolean): void {
    this.hint.innerHTML = touch
      ? '<b>&#9664; DRAG TO STEER &#9654;</b><b>TAP TO JUMP</b>'
      : '<b>A / D &nbsp;STEER</b><b>SPACE &nbsp;JUMP</b>';
    this.hint.classList.add('on');
    clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => this.hint.classList.remove('on'), 4500);
  }

  setStick(active: boolean, x: number, y: number, dx: number): void {
    this.stick.classList.toggle('on', active);
    if (!active) return;
    this.stick.style.left = x + 'px';
    this.stick.style.top = y + 'px';
    this.nub.style.transform = `translateX(${dx}px)`;
  }
}
