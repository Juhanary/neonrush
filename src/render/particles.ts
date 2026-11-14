import * as THREE from 'three';

const N = 1800;

/** Pooled additive point particles shared by every effect in the game. */
export class Particles {
  readonly points: THREE.Points;
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

  constructor() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uScale: { value: 600 } },
      vertexShader: /* glsl */ `
        attribute vec3 aColor; attribute float aSize; uniform float uScale; varying vec3 vC;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vC = aColor * smoothstep(1.5, 5.0, -mv.z); // fade out near the lens instead of turning into a big blob
          gl_PointSize = aSize * uScale / max(-mv.z, 0.5);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vC;
        void main() {
          float r = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.05, r);
          gl_FragColor = vec4(vC * a * a, 1.0);
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
    this.next = (i + 1) % N;
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
    for (let i = 0; i < N; i++) {
      if (this.life[i] <= 0) { this.size[i] = 0; continue; }
      this.life[i] -= dt;
      const j = i * 3;
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[j] *= d; this.vel[j + 1] = this.vel[j + 1] * d - this.grav[i] * dt; this.vel[j + 2] *= d;
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
      const k = Math.max(0, this.life[i] / this.max[i]);
      this.col[j] = this.base[j] * k; this.col[j + 1] = this.base[j + 1] * k; this.col[j + 2] = this.base[j + 2] * k;
      this.size[i] = this.bsize[i] * (0.4 + 0.6 * k);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
  }
}
