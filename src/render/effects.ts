import * as THREE from 'three';

/** Flat additive ribbon that follows a point (thruster trails). */
export class Ribbon {
  readonly mesh: THREE.Mesh;
  private hist: THREE.Vector3[] = [];
  private pos: Float32Array;
  private col: Float32Array;
  private readonly n: number;

  constructor(private color: THREE.Color, n = 30) {
    this.n = n;
    this.pos = new Float32Array(n * 2 * 3);
    this.col = new Float32Array(n * 2 * 3);
    const idx: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.mesh.frustumCulled = false;
  }

  setColor(c: THREE.Color): void { this.color = c; }
  reset(): void { this.hist.length = 0; }

  update(head: THREE.Vector3, width: number, intensity: number, spacing: number): void {
    const h = this.hist;
    if (h.length === 0 || h[0].distanceToSquared(head) > spacing * spacing) {
      h.unshift(head.clone());
      if (h.length > this.n - 1) h.pop();
    }
    for (let i = 0; i < this.n; i++) {
      const p = i === 0 ? head : h[Math.min(i - 1, h.length - 1)] ?? head;
      const t = i / (this.n - 1);
      const w = width * (1 - t * 0.85);
      const k = intensity * (1 - t) * (1 - t);
      const j = i * 6;
      this.pos[j] = p.x - w; this.pos[j + 1] = p.y; this.pos[j + 2] = p.z;
      this.pos[j + 3] = p.x + w; this.pos[j + 4] = p.y; this.pos[j + 5] = p.z;
      for (let v = 0; v < 2; v++) {
        this.col[j + v * 3] = this.color.r * k; this.col[j + v * 3 + 1] = this.color.g * k; this.col[j + v * 3 + 2] = this.color.b * k;
      }
    }
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
  }
}

/** Pool of expanding rings for jumps, landings, pads and explosions. */
export class Shockwaves {
  readonly group = new THREE.Group();
  private rings: { m: THREE.Mesh; mat: THREE.MeshBasicMaterial; age: number; life: number; size: number; c: THREE.Color }[] = [];
  private next = 0;

  constructor() {
    const geo = new THREE.RingGeometry(0.82, 1, 48);
    for (let i = 0; i < 10; i++) {
      const mat = new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      this.group.add(m);
      this.rings.push({ m, mat, age: 0, life: 0, size: 1, c: new THREE.Color() });
    }
  }

  spawn(x: number, y: number, z: number, c: THREE.Color, size: number, life: number, upright = false): void {
    const r = this.rings[this.next];
    this.next = (this.next + 1) % this.rings.length;
    r.m.position.set(x, y, z);
    r.m.rotation.set(upright ? 0 : -Math.PI / 2, 0, 0);
    r.m.visible = true;
    r.age = 0; r.life = life; r.size = size; r.c.copy(c);
  }

  clear(): void {
    for (const r of this.rings) r.m.visible = false;
  }

  update(dt: number): void {
    for (const r of this.rings) {
      if (!r.m.visible) continue;
      r.age += dt;
      const t = r.age / r.life;
      if (t >= 1) { r.m.visible = false; continue; }
      const e = 1 - (1 - t) * (1 - t) * (1 - t);
      r.m.scale.setScalar(0.3 + e * r.size);
      r.mat.color.copy(r.c).multiplyScalar((1 - t) * (1 - t) * 2.2);
    }
  }
}
