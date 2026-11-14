import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CFG } from '../core/config';
import type { Level } from '../core/level';
import type { SimEvent } from '../core/sim';
import { Background } from './background';
import { Ribbon, Shockwaves } from './effects';
import type { Palette } from './palette';
import { Particles } from './particles';
import { DEFAULT_SHIP, SHIPS, type ShipVisual } from './ship';
import { Track } from './track';

/** What the renderer needs to know about the ship each frame (already interpolated). */
export interface Pose {
  x: number; y: number; z: number; vx: number; vy: number; speed: number;
  grounded: boolean; boosting: boolean; alive: boolean;
  /** Simulation time (moving tiles) and whether gravity is reversed. */
  t: number; flip: boolean;
}

const QUALITY = [2.5, 2, 1.5, 1.25, 1];

export class View {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 1.78, 0.3, 800);
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;

  private track?: Track;
  private bg?: Background;
  private level?: Level;
  private ship?: ShipVisual;
  private pivot = new THREE.Group();
  private particles = new Particles();
  private waves = new Shockwaves();
  private ribbons: Ribbon[] = [];
  private marker: THREE.Mesh;

  private c = { edge: new THREE.Color(), accent: new THREE.Color(), trail: new THREE.Color(), gem: new THREE.Color(), block: new THREE.Color(), white: new THREE.Color(1.6, 1.6, 1.6), exhaust: new THREE.Color(), hot: new THREE.Color(0.9, 0.9, 0.9) };
  private shake = 0;
  private flash = 0;
  private flashShown = 0;
  private squash = 0;
  private roll = 0;
  private kick = 0;
  private camX = 0;
  private camY = 0;
  private exhaust = 0;
  private quality = 0;
  private slowFrames = 0;
  private frames = 0;
  private tmp = new THREE.Vector3();
  private hype = 0;
  private hv = 0;
  private rv = 0;
  private dots = 0;
  private fv = 0;
  private lift = 0;
  private rainbow = new THREE.Color();
  private rainbowDim = new THREE.Color();
  shipId = DEFAULT_SHIP;

  constructor(canvas: HTMLCanvasElement, private flashEl: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
    this.renderer.toneMapping = THREE.NoToneMapping;
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.45, 0.85);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.scene.add(this.pivot, this.particles.points, this.waves.group);
    for (let i = 0; i < 2; i++) {
      const r = new Ribbon(new THREE.Color());
      this.ribbons.push(r);
      this.scene.add(r.mesh);
    }
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.56, 28),
      new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.marker.rotation.x = -Math.PI / 2;
    this.scene.add(this.marker);
    this.resize();
  }

  loadLevel(level: Level, pal: Palette): void {
    if (this.track) { this.scene.remove(this.track.group); this.track.dispose(); }
    if (this.bg) { this.scene.remove(this.bg.group); this.bg.dispose(); }
    if (this.ship) { this.pivot.remove(this.ship.root); this.ship.dispose(); }
    this.level = level;
    this.track = new Track(level, pal);
    this.bg = new Background(pal, level.finishZ);
    this.ship = SHIPS[this.shipId](pal);
    this.pivot.add(this.ship.root);
    this.scene.add(this.track.group, this.bg.group);
    this.c.edge.set(pal.edge).multiplyScalar(1.5);
    this.c.accent.set(pal.accent).multiplyScalar(1.5);
    this.c.trail.set(pal.trail).multiplyScalar(1.4);
    this.c.exhaust.set(pal.trail).multiplyScalar(0.55);
    this.c.gem.set(pal.gem).multiplyScalar(1.6);
    this.c.block.set(pal.blockEdge).multiplyScalar(1.5);
    for (const r of this.ribbons) r.setColor(this.c.trail);
    (this.marker.material as THREE.MeshBasicMaterial).color.set(pal.accent).multiplyScalar(1.4);
    this.resize();
    this.resetRun();
  }

  resetRun(): void {
    this.track?.resetGems();
    this.particles.clear();
    this.waves.clear();
    for (const r of this.ribbons) r.reset();
    this.shake = 0; this.squash = 0; this.kick = 0; this.roll = 0; this.camX = 0; this.camY = 0;
    this.hype = 0; this.hv = 0; this.rv = 0; this.fv = 0;
    this.flash = Math.max(this.flash, 0.25);
  }

  /** 0 normal, 1 past halfway, 2 record run. The view eases towards it. */
  setHype(h: number): void { this.hype = h; }

  /** One-off celebration when a milestone is passed. */
  milestone(kind: 'half' | 'record', p: Pose): void {
    const P = this.particles, c = this.c;
    const x = p.x, y = p.y + 0.6, z = -p.z, fwd = -p.speed;
    if (kind === 'half') {
      P.burst(x, y, z, 70, 18, 0.9, 0.4, c.accent, { vz: fwd * 0.9, drag: 1.5 });
      this.waves.spawn(x, y, z, c.accent, 12, 0.6, true);
      this.waves.spawn(x, p.y + 0.05, z, c.edge, 9, 0.5);
      this.flash = Math.max(this.flash, 0.28);
      this.kick = Math.max(this.kick, 0.7);
    } else {
      const col = new THREE.Color();
      for (let i = 0; i < 6; i++) {
        col.setHSL(i / 6, 1, 0.6).multiplyScalar(1.6);
        P.burst(x, y, z, 34, 22, 1.2, 0.42, col, { vz: fwd * 0.95, drag: 1.4, grav: 5, up: 5 });
      }
      this.waves.spawn(x, y, z, c.white, 16, 0.7, true);
      this.waves.spawn(x, y, z - 2, c.accent, 12, 0.6, true);
      this.waves.spawn(x, p.y + 0.05, z, c.edge, 12, 0.6);
      this.flash = Math.max(this.flash, 0.5);
      this.kick = 1;
      this.shake = Math.max(this.shake, 0.3);
    }
  }

  /** A firework somewhere ahead of the camera (level complete). */
  firework(): void {
    const cam = this.camera.position;
    const col = new THREE.Color().setHSL(Math.random(), 1, 0.6).multiplyScalar(1.7);
    const x = cam.x + (Math.random() - 0.5) * 34, y = cam.y + 1 + Math.random() * 12, z = cam.z - 22 - Math.random() * 26;
    this.particles.burst(x, y, z, 80, 16, 1.3, 0.5, col, { drag: 1.8, grav: 5 });
    this.particles.burst(x, y, z, 14, 5, 0.5, 0.9, this.c.white, { drag: 3 });
    this.waves.spawn(x, y, z, col, 6, 0.5, true);
  }

  onEvent(e: SimEvent, p: Pose): void {
    const P = this.particles, c = this.c;
    const x = p.x, y = p.y + 0.3, z = -p.z;
    const fwd = -p.speed;
    switch (e.type) {
      case 'jump':
        P.burst(x, p.y + 0.1, z, 14, 7, 0.35, 0.3, c.trail, { flat: true, vz: fwd * 0.5 });
        this.waves.spawn(x, p.y + 0.05, z, c.edge, 2.2, 0.3);
        break;
      case 'pad':
        P.burst(x, p.y + 0.1, z, 34, 12, 0.6, 0.38, c.accent, { up: 6, vz: fwd * 0.6 });
        this.waves.spawn(x, p.y + 0.05, z, c.accent, 6, 0.45);
        this.flash = Math.max(this.flash, 0.18);
        this.kick = Math.max(this.kick, 0.5);
        break;
      case 'boost':
        P.burst(x, y, z, 40, 14, 0.6, 0.4, c.white, { vz: fwd * 0.3 });
        this.waves.spawn(x, y, z, c.white, 7, 0.4, true);
        this.flash = Math.max(this.flash, 0.22);
        this.kick = 1;
        break;
      case 'land': {
        const k = Math.min(1, e.impact / 24);
        P.burst(x, p.y + 0.08, z, 8 + Math.round(k * 22), 6 + k * 9, 0.4, 0.26, c.edge, { flat: true, up: 2 + k * 3, grav: 14, vz: fwd * 0.75 });
        this.track?.pulse(x, p.z);
        this.squash = Math.max(this.squash, 0.4 + k * 0.6);
        if (k > 0.55) { this.waves.spawn(x, p.y + 0.05, z, c.edge, 4.5, 0.35); this.shake = Math.max(this.shake, 0.18); }
        break;
      }
      case 'gem':
        this.track?.hideGem(e.id);
        P.burst(e.x, e.y + 0.15, -e.z, 18, 9, 0.5, 0.3, c.gem, { vz: fwd * 0.8 });
        P.burst(e.x, e.y + 0.15, -e.z, 5, 4, 0.35, 0.5, c.white, { vz: fwd * 0.8 });
        break;
      case 'nearMiss':
        P.burst(x + e.side * 0.8, y, z, 10, 6, 0.3, 0.22, c.block, { vz: fwd * 0.4 });
        break;
      case 'flipOn':
        P.burst(x, y, z, 90, 20, 1.0, 0.45, c.white, { up: 14, vz: fwd * 0.9, drag: 1.2 });
        P.burst(x, y, z, 60, 16, 1.0, 0.4, c.accent, { up: 18, vz: fwd * 0.9, drag: 1.2 });
        this.waves.spawn(x, y, z, c.white, 18, 0.7, true);
        this.waves.spawn(x, p.y + 0.05, z, c.accent, 14, 0.6);
        this.flash = Math.max(this.flash, 0.5);
        this.shake = Math.max(this.shake, 0.55);
        this.kick = 1;
        break;
      case 'flipOff':
        P.burst(x, y, z, 80, 18, 0.9, 0.42, c.accent, { up: -8, vz: fwd * 0.9, drag: 1.4 });
        this.waves.spawn(x, y, z, c.accent, 16, 0.6, true);
        this.flash = Math.max(this.flash, 0.4);
        this.shake = Math.max(this.shake, 0.35);
        this.kick = Math.max(this.kick, 0.7);
        break;
      case 'thrust':
        // the kick fires out of the top of the hull
        P.burst(x, p.y + 1.0, z, 10, 4, 0.3, 0.2, c.accent, { up: 11, vz: fwd * 0.95, drag: 2 });
        this.waves.spawn(x, p.y + 1.1, z, c.accent, 2.4, 0.25);
        this.squash = Math.max(this.squash, 0.5);
        break;
      case 'crash':
      case 'fly':
      case 'fall':
        P.burst(x, y, z, 110, 24, 1.0, 0.5, c.trail, { drag: 2.4, grav: 7, vz: fwd * 0.45 });
        P.burst(x, y, z, 60, 34, 0.8, 0.36, c.accent, { drag: 2.8, vz: fwd * 0.45 });
        P.burst(x, y, z, 40, 12, 0.6, 0.85, c.white, { drag: 3, vz: fwd * 0.45 });
        this.waves.spawn(x, y, z, c.edge, 10, 0.5);
        this.waves.spawn(x, y, z - 1, c.accent, 8, 0.45, true);
        this.shake = 1;
        this.flash = 0.6;
        break;
      case 'finish':
        P.burst(x, y + 1.5, z, 160, 30, 1.4, 0.5, c.accent, { drag: 1.6 });
        P.burst(x, y + 1.5, z, 100, 20, 1.2, 0.5, c.edge, { drag: 1.6 });
        this.waves.spawn(x, y + 1.5, z, c.white, 16, 0.8, true);
        this.flash = 0.9;
        break;
    }
  }

  frame(dt: number, p: Pose, time: number, beat: number, menu: boolean): void {
    const ship = this.ship, track = this.track, bg = this.bg;
    if (!ship || !track || !bg) return;
    const k = (r: number) => 1 - Math.exp(-dt * r);
    this.hv += ((this.hype >= 1 ? 1 : 0) - this.hv) * k(3);
    this.rv += ((this.hype >= 2 ? 1 : 0) - this.rv) * k(3);
    const hv = this.hv, rv = this.rv;
    this.rainbow.setHSL((time * 0.7) % 1, 1, 0.58).multiplyScalar(1.5);
    this.rainbowDim.copy(this.rainbow).multiplyScalar(0.45);
    this.fv += ((p.flip && p.alive ? 1 : 0) - this.fv) * k(5);
    const fv = this.fv;
    this.bloom.strength = 0.5 + 0.1 * hv + 0.12 * rv + 0.04 * fv;

    // ---- ship pose -------------------------------------------------------
    const hover = 0.55 + (p.grounded ? Math.sin(time * 3.2) * 0.06 : 0);
    const sx = p.x, sy = p.y + hover, sz = -p.z;
    this.roll += (-p.vx / CFG.steerSpeed * 0.55 - this.roll) * k(12);
    this.squash *= Math.exp(-dt * 9);
    const sq = this.squash * Math.cos(this.squash * 9);
    this.pivot.visible = p.alive;
    this.pivot.position.set(sx, sy - Math.max(0, sq) * 0.25, sz);
    this.pivot.rotation.set(
      THREE.MathUtils.clamp(p.vy * 0.018, -0.4, 0.4) + Math.sin(time * 7.3) * 0.1 * fv,
      -p.vx * 0.016,
      this.roll + Math.sin(time * 9) * 0.16 * fv);
    this.pivot.scale.set(1 + sq * 0.18, 1 - sq * 0.3, 1 + sq * 0.1);
    const power = menu ? 0.5 : p.boosting ? 2 : 1;
    ship.update(time, power);

    // ---- trails and exhaust ----------------------------------------------
    this.pivot.updateMatrixWorld();
    this.exhaust += dt * (p.boosting ? 110 : 55);
    for (let i = 0; i < ship.thrusters.length && i < this.ribbons.length; i++) {
      const w = this.tmp.copy(ship.thrusters[i]).applyMatrix4(this.pivot.matrixWorld);
      const rb = this.ribbons[i];
      rb.mesh.visible = p.alive && !menu;
      rb.setColor(rv > 0.5 ? this.rainbow : this.c.trail);
      if (p.alive) rb.update(w, (p.boosting ? 0.2 : 0.11) * (1 + 0.5 * hv + 0.5 * rv), (p.boosting ? 1.5 : 0.7) * (1 + 0.4 * hv + 0.5 * rv), 0.9);
      if (p.alive) {
        for (let n = Math.floor(this.exhaust); n > 0; n--) {
          this.particles.spawn(w.x, w.y, w.z,
            (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, 5 + Math.random() * 7,
            0.16 + Math.random() * 0.2, p.boosting ? 0.26 : 0.15, p.boosting ? this.c.hot : rv > 0.5 ? this.rainbowDim : this.c.exhaust, 1);
        }
      }
    }
    this.exhaust -= Math.floor(this.exhaust);

    // speed streaks past the road once the run heats up
    if (!menu && p.alive && hv > 0.05) {
      this.dots += dt * (45 * hv + 70 * rv);
      for (let n = Math.floor(this.dots); n > 0; n--) {
        const side = Math.random() < 0.5 ? -1 : 1;
        this.particles.spawn(sx + side * (7.5 + Math.random() * 14), -2 + Math.random() * 13, sz - 70 - Math.random() * 30,
          0, 0, 55 + Math.random() * 30, 1.1, 0.22 + Math.random() * 0.2, rv > 0.5 ? this.rainbow : this.c.edge, 0);
      }
      this.dots -= Math.floor(this.dots);
    }

    // reversed gravity: sparks stream upwards all around the ship
    if (fv > 0.05 && p.alive) {
      this.lift += dt * 38 * fv;
      for (let n = Math.floor(this.lift); n > 0; n--) {
        this.particles.spawn(sx + (Math.random() - 0.5) * 22, -3 + Math.random() * 6, sz - 6 - Math.random() * 60,
          0, 10 + Math.random() * 12, 0, 0.9, 0.14 + Math.random() * 0.12, Math.random() < 0.5 ? this.c.accent : this.c.edge, 0);
      }
      this.lift -= Math.floor(this.lift);
    }

    // landing marker while airborne
    const ground = this.level!.heightAt(p.x, p.z, p.t);
    this.marker.visible = p.alive && !p.grounded && ground !== null && p.y > ground + 0.25;
    if (this.marker.visible) {
      this.marker.position.set(sx, ground! + 0.04, sz);
      this.marker.scale.setScalar(1 + Math.min(1.2, (p.y - ground!) * 0.35));
    }

    // ---- camera ----------------------------------------------------------
    const cam = this.camera;
    this.kick *= Math.exp(-dt * 2.2);
    this.shake *= Math.exp(-dt * 6);
    const aspect = cam.aspect;
    const baseFov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(0.62 / aspect)), 58, 96);
    const fov = baseFov + this.kick * 9 + (p.boosting ? 4 : 0) + fv * 7;
    if (Math.abs(fov - cam.fov) > 0.01) { cam.fov += (fov - cam.fov) * k(8); cam.updateProjectionMatrix(); }
    if (menu) {
      const a = time * 0.25;
      cam.position.set(sx + Math.sin(a) * 6.5, 2.6 + Math.sin(a * 0.7) * 0.6, sz + 5 + Math.cos(a) * 3);
      cam.lookAt(sx, 1.0, sz - 4);
    } else {
      this.camX += (p.x * 0.74 - this.camX) * k(8);
      this.camY += (Math.max(-1.5, p.y) * 0.5 - this.camY) * k(6);
      const sh = this.shake * this.shake;
      cam.position.set(
        this.camX + (Math.random() - 0.5) * sh * 1.6,
        this.camY + 4.2 + (Math.random() - 0.5) * sh * 1.6,
        sz + 8.4 - this.kick * 0.8);
      cam.lookAt(this.camX * 0.92 + p.x * 0.08, this.camY + 1.1, sz - 15);
      cam.rotateZ(-p.vx * 0.0035 + (Math.random() - 0.5) * sh * 0.08 + Math.sin(time * 1.9) * 0.07 * fv);
    }

    // ---- world -----------------------------------------------------------
    track.update(dt, time, beat, p.z, hv, rv, p.t, fv);
    bg.update(dt, time, beat, cam.position, hv, rv, fv);
    this.particles.update(dt);
    this.waves.update(dt);

    this.flash *= Math.exp(-dt * 5.5);
    if (Math.abs(this.flash - this.flashShown) > 0.01) {
      this.flashShown = this.flash < 0.012 ? 0 : this.flash;
      this.flashEl.style.opacity = this.flashShown.toFixed(2);
    }

    this.composer.render(dt);
    this.autoQuality(dt);
  }

  /** Drop resolution when the device cannot hold ~50 fps. Never raises it again mid-session. */
  private autoQuality(dt: number): void {
    this.frames++;
    if (this.frames < 90) return; // ignore shader compile hitches at startup
    if (dt > 1 / 48) this.slowFrames++;
    if (this.frames % 120 === 0) {
      if (this.slowFrames > 45 && this.quality < QUALITY.length - 1) { this.quality++; this.resize(); }
      this.slowFrames = 0;
    }
  }

  resize(): void {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    const pr = Math.min(window.devicePixelRatio || 1, QUALITY[this.quality]);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const px = (h * pr) / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
    this.particles.setScale(px);
    this.bg?.setScale(px);
  }
}
