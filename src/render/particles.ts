import * as THREE from 'three';

const N = 1800;

/**
 * Pooled point particles. The default pool is additive (sparks, glow) and fades by darkening.
 * A `dark` pool is drawn with normal blending, so it can show dark colours (smoke, soot): it fades
 * by transparency and its puffs grow as they age instead of shrinking.
 */
export class Particles {
  readonly points: THREE.Points;
  private alpha: Float32Array;
  private pos = new Float32Array(N * 3);
  private col = new Float32Array(N * 3);
  private size = new Float32Array(N);
  private vel = new Float32Array(N * 3);
  private base = new Float32Array(N * 3);
  private life = new Float32Array(N);
  private max = new Float32Array(N);
  private bsize = new Float32Array(N);
  private drag = new Float32Array(N);
  private grav = new Float32Array(N);
  private next = 0;
  private mat: THREE.ShaderMaterial;

  constructor(private readonly dark = false, private readonly n = N) {
    this.alpha = new Float32Array(n);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      // dark puffs blend colour only: normal blending would also lower the frame's alpha, and the page behind
      // the canvas would then shine through the smoke and make it look light instead of dark
      blending: dark ? THREE.CustomBlending : THREE.AdditiveBlending,
      blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      defines: dark ? { DARK: 1 } : {},
      uniforms: { uScale: { value: 600 } },
      vertexShader: /* glsl */ `
        attribute vec3 aColor; attribute float aSize; attribute float aAlpha; uniform float uScale; varying vec3 vC; varying float vA;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
        #ifdef DARK
          float nearFade = smoothstep(0.8, 2.5, -mv.z);
        #else
          float nearFade = smoothstep(1.5, 5.0, -mv.z); // fade out near the lens instead of turning into a big blob
        #endif
          vC = aColor * nearFade;
          vA = aAlpha * nearFade;
          gl_PointSize = aSize * uScale / max(-mv.z, 0.5);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vC; varying float vA;
        void main() {
          float r = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.05, r);
        #ifdef DARK
          gl_FragColor = vec4(vC, a * vA);
        #else
          gl_FragColor = vec4(vC * a * a, 1.0);
        #endif
        }`,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
  }

  setScale(px: number): void {
    this.mat.uniforms.uScale.value = px;
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number,
        life: number, size: number, c: THREE.Color, drag = 0, grav = 0): void {
    const i = this.next;
    this.next = (i + 1) % this.n;
    const j = i * 3;
    this.pos[j] = x; this.pos[j + 1] = y; this.pos[j + 2] = z;
    this.vel[j] = vx; this.vel[j + 1] = vy; this.vel[j + 2] = vz;
    this.base[j] = c.r; this.base[j + 1] = c.g; this.base[j + 2] = c.b;
    this.life[i] = life; this.max[i] = life; this.bsize[i] = size;
    this.drag[i] = drag; this.grav[i] = grav;
  }

  /** Radial burst helper. */
  burst(x: number, y: number, z: number, n: number, speed: number, life: number, size: number,
        c: THREE.Color, opts: { up?: number; drag?: number; grav?: number; flat?: boolean; vz?: number } = {}): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = opts.flat ? (Math.random() - 0.5) * 0.3 : Math.acos(2 * Math.random() - 1) - Math.PI / 2;
      const s = speed * (0.35 + Math.random() * 0.65);
      this.spawn(x, y, z,
        Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + (opts.up ?? 0), Math.sin(a) * Math.cos(e) * s + (opts.vz ?? 0),
        life * (0.5 + Math.random() * 0.5), size * (0.6 + Math.random() * 0.8), c, opts.drag ?? 2, opts.grav ?? 0);
    }
  }

  clear(): void {
    this.life.fill(0);
  }

  update(dt: number): void {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.size[i] = 0; continue; }
      this.life[i] -= dt;
      const j = i * 3;
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[j] *= d; this.vel[j + 1] = this.vel[j + 1] * d - this.grav[i] * dt; this.vel[j + 2] *= d;
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
      const k = Math.max(0, this.life[i] / this.max[i]);
      if (this.dark) {
        // smoke keeps its colour, thins out and spreads
        this.col[j] = this.base[j]; this.col[j + 1] = this.base[j + 1]; this.col[j + 2] = this.base[j + 2];
        this.alpha[i] = k * (2 - k) * 0.6;
        this.size[i] = this.bsize[i] * (0.5 + 1.1 * (1 - k));
      } else {
        this.col[j] = this.base[j] * k; this.col[j + 1] = this.base[j + 1] * k; this.col[j + 2] = this.base[j + 2] * k;
        this.size[i] = this.bsize[i] * (0.4 + 0.6 * k);
      }
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
  }
}
