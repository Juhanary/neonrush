import * as THREE from 'three';
import { CFG, ROAD_W } from '../core/config';
import { Level, gemHeight } from '../core/level';
import type { Palette } from './palette';

const VERT = /* glsl */ `
attribute float aKind;
attribute float aSeed;
uniform float uTime, uBeat, uShipZ;
varying vec3 vLocal, vScale, vWorld;
varying float vKind, vSeed, vAhead;
void main() {
  vLocal = position; vKind = aKind; vSeed = aSeed;
  vec3 p = position;
  vScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  if (aKind > 4.5) {
    float k = 1.0 + (0.06 + 0.16 * aSeed) * uBeat + 0.05 * sin(uTime * 1.3 + aSeed * 40.0);
    p.y = (p.y + 0.5) * k - 0.5;
  }
  vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
  float ahead = -w.z - uShipZ;
  float far = smoothstep(105.0, 165.0, ahead);
  if (aKind < 4.5) {
    // the road assembles itself out of the distance
    w.y -= far * far * (8.0 + aSeed * 16.0);
    w.x += far * far * (aSeed - 0.5) * 7.0;
  }
  vAhead = ahead; vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */ `
uniform vec3 uFloor, uEdge, uBlock, uBlockEdge, uAccent, uFog, uGlow;
uniform float uTime, uBeat;
uniform vec3 uPulse; // x, z, age
varying vec3 vLocal, vScale, vWorld;
varying float vKind, vSeed, vAhead;

float chevrons(float speed) {
  float f = fract(vLocal.z * 2.5 - abs(vLocal.x) * 2.2 + uTime * speed);
  return smoothstep(0.35, 0.5, f) * smoothstep(0.95, 0.8, f);
}

void main() {
  vec3 dd = (0.5 - abs(vLocal)) * vScale;
  float a = min(dd.x, min(dd.y, dd.z));
  float c = max(dd.x, max(dd.y, dd.z));
  float b = dd.x + dd.y + dd.z - a - c;        // distance to the nearest box edge
  float w = 0.075 + max(vAhead, 0.0) * 0.0024;  // keep lines visible far away
  float edge = smoothstep(w, w * 0.3, b);
  float halo = smoothstep(0.6, 0.0, b);
  bool top = vLocal.y > 0.49;
  float near = smoothstep(75.0, 2.0, vAhead);
  float wave = 0.5 + 0.5 * sin(vAhead * 0.32 + uTime * 5.0);

  vec3 base; vec3 ecol; float gain;
  if (vKind < 0.5) {            // floor
    float chk = mod(floor(vWorld.x / 2.4 + 50.0) + floor(-vWorld.z / 4.0), 2.0);
    base = uFloor * (0.42 + 0.2 * chk) * (top ? 1.0 : 0.55);
    if (top) base += uEdge * (0.03 * near + 0.04 * uBeat);
    ecol = uEdge; gain = 0.85 + 0.75 * near * (0.5 + 0.5 * wave) + 0.4 * uBeat;
  } else if (vKind < 1.5) {     // block (obstacle)
    float stripes = step(0.5, fract((vWorld.x + vWorld.y) * 0.9 - uTime * 0.9));
    base = uBlock * (0.30 + 0.24 * stripes + 0.22 * uBeat);
    ecol = uBlockEdge; gain = 2.0 + 0.9 * uBeat;
  } else if (vKind < 2.5) {     // jump pad
    base = uAccent * 0.22;
    if (top) base += uAccent * chevrons(2.2) * 1.5;
    ecol = uAccent; gain = 2.0 + 0.6 * uBeat;
  } else if (vKind < 3.5) {     // boost pad
    vec3 hot = mix(uEdge, vec3(1.0), 0.55);
    base = hot * 0.2;
    if (top) base += hot * chevrons(4.5) * 1.5;
    ecol = hot; gain = 2.2;
  } else if (vKind < 4.5) {     // finish runway
    float chk = mod(floor(vLocal.x * 4.0 + 8.0) + floor(vLocal.z * 4.0 + 8.0), 2.0);
    base = mix(uFloor * 0.6, vec3(0.9), top ? chk * 0.55 : 0.0);
    ecol = uAccent; gain = 2.0;
  } else {                      // skyline pillar
    float band = smoothstep(0.82, 0.9, fract(vWorld.y * 0.22 + vSeed * 7.0 - uTime * 0.25));
    base = uFloor * 0.32 + uGlow * band * 0.3;
    ecol = mix(uEdge, uGlow, vSeed); gain = 0.45 + 0.7 * uBeat * vSeed;
  }
  vec3 col = base + ecol * (edge * gain + halo * 0.08 * gain);

  float pd = length(vWorld.xz - uPulse.xy);
  float ring = smoothstep(1.4, 0.0, abs(pd - uPulse.z * 34.0)) * exp(-uPulse.z * 4.0);
  if (vKind < 4.5) col += ecol * ring * 1.8;

  float f = smoothstep(85.0, 180.0, vAhead);
  col = mix(col, uFog, f * 0.85);
  gl_FragColor = vec4(col, 1.0);
}`;

export interface TrackUniforms {
  [k: string]: THREE.IUniform;
  uTime: THREE.IUniform<number>; uBeat: THREE.IUniform<number>; uShipZ: THREE.IUniform<number>;
  uPulse: THREE.IUniform<THREE.Vector3>;
}

function hdr(hex: number, k: number): THREE.Color {
  return new THREE.Color(hex).multiplyScalar(k);
}

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** All static geometry of one level: tiles, pads, blocks, skyline, gems, gates and the finish portal. */
export class Track {
  readonly group = new THREE.Group();
  readonly uniforms: TrackUniforms;
  private gems = new Map<number, THREE.Mesh>();
  private spinners: { o: THREE.Object3D; s: number }[] = [];
  private portal: THREE.Group;
  private disposables: { dispose(): void }[] = [];

  constructor(level: Level, pal: Palette) {
    const col = (h: number) => ({ value: new THREE.Color(h) });
    this.uniforms = {
      uTime: { value: 0 }, uBeat: { value: 0 }, uShipZ: { value: 0 },
      uPulse: { value: new THREE.Vector3(0, 0, 99) },
      uFloor: col(pal.floor), uEdge: col(pal.edge), uBlock: col(pal.block), uBlockEdge: col(pal.blockEdge),
      uAccent: col(pal.accent), uFog: col(pal.fog), uGlow: col(pal.glow),
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms });
    const box = new THREE.BoxGeometry(1, 1, 1);
    this.disposables.push(mat, box);
    const rand = rng(level.length * 7919 + level.def.world);

    // ---- tiles ----------------------------------------------------------
    const items: { m: THREE.Matrix4; kind: number; seed: number }[] = [];
    const add = (x: number, y: number, z: number, sx: number, sy: number, sz: number, kind: number) => {
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, -z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
      items.push({ m, kind, seed: rand() });
    };
    const tw = CFG.tileW * 0.955, tl = CFG.tileL * 0.965;
    for (let row = 0; row < level.length + CFG.runway; row++) {
      for (let lane = 0; lane < CFG.lanes; lane++) {
        const t = level.tile(row, lane);
        if (t === '.' || t === '*') continue;
        const x = level.laneCenter(lane), z = (row + 0.5) * CFG.tileL;
        if (t === '#') add(x, CFG.blockH / 2 - 0.25, z, tw, CFG.blockH + 0.5, tl, 1);
        else add(x, -0.25, z, tw, 0.5, tl, row >= level.length ? 4 : t === '^' ? 2 : t === '>' ? 3 : 0);
      }
    }
    this.group.add(this.instanced(box, mat, items));

    // ---- skyline --------------------------------------------------------
    const pillars: typeof items = [];
    const total = level.finishZ + 220;
    for (let z = -40; z < total; z += 7) {
      for (const side of [-1, 1]) {
        const far = rand() < 0.45;
        const x = side * ((far ? 52 : 22) + rand() * 28);
        const h = 18 + rand() * (far ? 60 : 34);
        const wdt = 3 + rand() * 5;
        const topY = (far ? -2 : -16) + rand() * (far ? 24 : 12);
        const m = new THREE.Matrix4().compose(
          new THREE.Vector3(x, topY - h / 2, -(z + rand() * 5)), new THREE.Quaternion(), new THREE.Vector3(wdt, h, wdt));
        pillars.push({ m, kind: 5, seed: rand() });
      }
    }
    this.group.add(this.instanced(box, mat, pillars));

    // ---- gems -----------------------------------------------------------
    const gemGeo = new THREE.OctahedronGeometry(0.42);
    const gemMat = new THREE.MeshBasicMaterial({ color: hdr(pal.gem, 1.7) });
    const gemEdge = new THREE.LineBasicMaterial({ color: hdr(0xffffff, 1.6) });
    const gemEdges = new THREE.EdgesGeometry(gemGeo);
    this.disposables.push(gemGeo, gemMat, gemEdge, gemEdges);
    for (let row = 0; row < level.length; row++) {
      for (let lane = 0; lane < CFG.lanes; lane++) {
        const t = level.tile(row, lane);
        if (t !== 'o' && t !== 'O' && t !== '*') continue;
        const g = new THREE.Mesh(gemGeo, gemMat);
        g.add(new THREE.LineSegments(gemEdges, gemEdge));
        g.position.set(level.laneCenter(lane), gemHeight(t) + 0.15, -(row + 0.5) * CFG.tileL);
        g.scale.set(1, 1.35, 1);
        this.gems.set(row * CFG.lanes + lane, g);
        this.group.add(g);
      }
    }

    // ---- gates the road flies through -------------------------------------
    const gateCols = [pal.edge, pal.glow, pal.accent];
    for (let z = 70, i = 0; z < level.finishZ - 30; z += 96, i++) {
      const sides = [4, 6, 3, 32][i % 4];
      const geo = new THREE.TorusGeometry(13, 0.16, 6, sides);
      const m = new THREE.MeshBasicMaterial({ color: hdr(gateCols[i % 3], 1.15) });
      this.disposables.push(geo, m);
      for (let k = 0; k < 2; k++) {
        const ring = new THREE.Mesh(geo, m);
        ring.position.set(0, 3, -(z + k * 5));
        ring.scale.setScalar(1 + k * 0.22);
        ring.rotation.z = k * 0.6;
        this.spinners.push({ o: ring, s: (k ? -0.5 : 0.35) * (i % 2 ? -1 : 1) });
        this.group.add(ring);
      }
    }

    // ---- finish portal ---------------------------------------------------
    this.portal = new THREE.Group();
    this.portal.position.set(0, 2.6, -level.finishZ);
    const pc = [pal.accent, pal.edge, pal.glow];
    for (let i = 0; i < 3; i++) {
      const geo = new THREE.TorusGeometry(5.2 + i * 1.3, 0.2 - i * 0.04, 8, [48, 6, 4][i]);
      const m = new THREE.MeshBasicMaterial({ color: hdr(pc[i], 2.2) });
      this.disposables.push(geo, m);
      const ring = new THREE.Mesh(geo, m);
      this.spinners.push({ o: ring, s: [0.6, -0.9, 1.3][i] });
      this.portal.add(ring);
    }
    const discGeo = new THREE.CircleGeometry(5.1, 48);
    const discMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uTime: this.uniforms.uTime, uA: col(pal.accent), uB: col(pal.edge) },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv - 0.5; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uA, uB; varying vec2 vUv;
        void main() {
          float r = length(vUv) * 2.0; float a = atan(vUv.y, vUv.x);
          float sw = 0.5 + 0.5 * sin(a * 5.0 + r * 9.0 - uTime * 5.0);
          float rings = 0.5 + 0.5 * sin(r * 22.0 - uTime * 8.0);
          vec3 c = mix(uB, uA, sw) * (0.25 + 0.6 * sw * rings) * smoothstep(1.0, 0.75, r);
          gl_FragColor = vec4(c + vec3(1.0) * smoothstep(0.25, 0.0, r) * 0.6, 1.0);
        }`,
    });
    this.disposables.push(discGeo, discMat);
    this.portal.add(new THREE.Mesh(discGeo, discMat));
    this.group.add(this.portal);

    // suppress unused warning for road width (kept for future side rails)
    void ROAD_W;
  }

  private instanced(geo: THREE.BufferGeometry, mat: THREE.Material, items: { m: THREE.Matrix4; kind: number; seed: number }[]) {
    const g = geo.clone();
    this.disposables.push(g);
    const mesh = new THREE.InstancedMesh(g, mat, items.length);
    const kind = new Float32Array(items.length), seed = new Float32Array(items.length);
    items.forEach((it, i) => { mesh.setMatrixAt(i, it.m); kind[i] = it.kind; seed[i] = it.seed; });
    g.setAttribute('aKind', new THREE.InstancedBufferAttribute(kind, 1));
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
    mesh.frustumCulled = false;
    return mesh;
  }

  resetGems(): void {
    for (const g of this.gems.values()) g.visible = true;
  }
  hideGem(id: number): void {
    const g = this.gems.get(id);
    if (g) g.visible = false;
  }
  pulse(x: number, z: number): void {
    this.uniforms.uPulse.value.set(x, -z, 0);
  }

  update(dt: number, time: number, beat: number, shipZ: number): void {
    const u = this.uniforms;
    u.uTime.value = time; u.uBeat.value = beat; u.uShipZ.value = shipZ;
    u.uPulse.value.z += dt;
    for (const sp of this.spinners) sp.o.rotation.z += sp.s * dt;
    const s = 1 + beat * 0.06;
    this.portal.scale.set(s, s, 1);
    for (const g of this.gems.values()) {
      if (!g.visible) continue;
      const d = -g.position.z - shipZ;
      if (d < -10 || d > 170) continue;
      g.rotation.y = time * 2.4 + g.position.z;
      const k = 1 + beat * 0.22;
      g.scale.set(k, 1.35 * k, k);
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
