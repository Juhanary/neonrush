import * as THREE from 'three';
import { CFG, ROAD_W } from '../core/config';
import { Level, gemHeight, isGem } from '../core/level';
import type { Palette } from './palette';

const VERT = /* glsl */ `
attribute float aKind;
attribute float aSeed;
attribute float aRow;
uniform float uTime, uBeat, uShipZ, uSimT, uFlip;
varying vec3 vLocal, vScale, vWorld;
varying float vKind, vSeed, vAhead;
void main() {
  vLocal = position; vKind = aKind; vSeed = aSeed;
  vec3 p = position;
  vScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  if (aKind > 4.5 && aKind < 5.5) {
    float k = 1.0 + (0.06 + 0.16 * aSeed) * uBeat + 0.05 * sin(uTime * 1.3 + aSeed * 40.0);
    p.y = (p.y + 0.5) * k - 0.5;
  }
  vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
  float ahead = -w.z - uShipZ;
  float far = smoothstep(105.0, 165.0, ahead);
  if (aKind > 5.5 && aKind < 6.5) w.x += MOVE_AMP * sin(uSimT * MOVE_W - aRow * MOVE_K); // moving road, same formula as the sim (uSimT = the ship's beat position)
  if (aKind < 4.5 || aKind > 5.5) {
    // the road assembles itself out of the distance
    w.y -= far * far * (8.0 + aSeed * 16.0);
    w.x += far * far * (aSeed - 0.5) * 7.0;
    // reversed gravity makes the whole road tremble
    if (aKind < 8.5) w.y += sin(uTime * 9.0 + aSeed * 40.0) * 0.025 * uFlip;
  }
  vAhead = ahead; vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */ `
uniform vec3 uFloor, uEdge, uBlock, uBlockEdge, uAccent, uFog, uGlow;
uniform float uTime, uBeat, uHype, uRec, uFlip;
uniform vec3 uPulse; // x, z, age
vec3 hue(float h) { return 0.5 + 0.5 * cos(6.2832 * (h + vec3(0.0, 0.33, 0.67))); }
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
    ecol = mix(uEdge, hue(vAhead * 0.02 - uTime * 0.7) * 1.2, 0.8 * uRec);
    gain = (0.85 + 0.75 * near * (0.5 + 0.5 * wave) + 0.4 * uBeat) * (1.0 + 0.3 * uHype + 0.2 * uRec);
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
  } else if (vKind > 5.5 && vKind < 6.5) {   // moving road: sideways arrows
    float ar = fract(abs(vLocal.x) * 2.4 - abs(vLocal.z) * 1.2 - uTime * 1.6);
    base = uFloor * 0.6;
    if (top) base += uAccent * smoothstep(0.55, 0.7, ar) * smoothstep(1.0, 0.85, ar) * 0.5;
    ecol = uAccent; gain = 1.5 + 0.5 * uBeat;
  } else if (vKind > 6.5 && vKind < 7.5) {   // ice: pale, glossy, sparkling
    vec3 ice = vec3(0.42, 0.68, 0.95);
    float streak = smoothstep(0.75, 1.0, sin(vWorld.x * 2.3 + vWorld.z * 0.9));
    float spark = step(0.985, fract(sin(dot(floor(vWorld.xz * 3.0), vec2(12.9898, 78.233))) * 43758.5453 + uTime * 0.7));
    base = mix(uFloor, ice, top ? 0.42 + 0.2 * streak : 0.25) * 0.6;
    if (top) base += vec3(1.0) * spark * 0.8;
    ecol = vec3(0.75, 0.93, 1.0); gain = 0.95 + 0.35 * uBeat;
  } else if (vKind > 7.5 && vKind < 8.5) {   // rail: a bright narrow beam
    float run = 0.5 + 0.5 * sin(vWorld.z * 1.4 + uTime * 9.0);
    base = uEdge * (0.3 + 0.3 * run);
    ecol = uEdge; gain = 1.9 + 0.6 * uBeat;
  } else if (vKind > 8.5) {     // ceiling of a gravity-flip zone: obstacle colour, it kills
    // kept dim on purpose: the bars converge on the horizon and would bloom into a white blot over the road
    base = uBlock * (0.34 + 0.1 * sin(uTime * 4.0 + vWorld.z * 0.5));
    ecol = uBlockEdge; gain = 0.55;
  } else {                      // skyline pillar
    float band = smoothstep(0.82, 0.9, fract(vWorld.y * 0.22 + vSeed * 7.0 - uTime * 0.25));
    base = uFloor * 0.32 + uGlow * band * 0.3;
    ecol = mix(uEdge, uGlow, vSeed); gain = 0.45 + 0.7 * uBeat * vSeed;
  }
  gain *= 1.0 + 0.15 * uFlip * (0.5 + 0.5 * sin(uTime * 8.0 - vAhead * 0.4));
  vec3 col = base + ecol * (edge * gain + halo * 0.08 * gain);

  float pd = length(vWorld.xz - uPulse.xy);
  float ring = smoothstep(1.4, 0.0, abs(pd - uPulse.z * 34.0)) * exp(-uPulse.z * 4.0);
  if (vKind < 0.5 || (vKind > 1.5 && vKind < 4.5)) col += ecol * ring * 1.0; // never on blocks: their look must not change

  float f = smoothstep(85.0, 180.0, vAhead);
  col = mix(col, uFog, f * 0.85);
  gl_FragColor = vec4(col, 1.0);
}`;

export interface TrackUniforms {
  [k: string]: THREE.IUniform;
  uTime: THREE.IUniform<number>; uBeat: THREE.IUniform<number>; uShipZ: THREE.IUniform<number>;
  uPulse: THREE.IUniform<THREE.Vector3>;
  uHype: THREE.IUniform<number>; uRec: THREE.IUniform<number>;
  uSimT: THREE.IUniform<number>; uFlip: THREE.IUniform<number>;
}

function hdr(hex: number, k: number): THREE.Color {
  return new THREE.Color(hex).multiplyScalar(k);
}

interface Item { m: THREE.Matrix4; kind: number; seed: number; row: number }

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
  private marks: { g: THREE.Group; z: number; mat: THREE.MeshBasicMaterial }[] = [];
  private markOff: THREE.Color;
  private markOn: THREE.Color;
  private disposables: { dispose(): void }[] = [];

  constructor(level: Level, pal: Palette) {
    const col = (h: number) => ({ value: new THREE.Color(h) });
    this.uniforms = {
      uTime: { value: 0 }, uBeat: { value: 0 }, uShipZ: { value: 0 },
      uPulse: { value: new THREE.Vector3(0, 0, 99) }, uHype: { value: 0 }, uRec: { value: 0 }, uSimT: { value: 0 }, uFlip: { value: 0 },
      uFloor: col(pal.floor), uEdge: col(pal.edge), uBlock: col(pal.block), uBlockEdge: col(pal.blockEdge),
      uAccent: col(pal.accent), uFog: col(pal.fog), uGlow: col(pal.glow),
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms,
      defines: { MOVE_AMP: CFG.moveAmp.toFixed(4), MOVE_W: CFG.moveBeat.toFixed(5), MOVE_K: CFG.moveK.toFixed(5) },
    });
    const box = new THREE.BoxGeometry(1, 1, 1);
    this.disposables.push(mat, box);
    const rand = rng(level.length * 7919 + level.def.world);

    // ---- tiles ----------------------------------------------------------
    const items: Item[] = [];
    const add = (x: number, y: number, z: number, sx: number, sy: number, sz: number, kind: number, row = 0) => {
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, -z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
      items.push({ m, kind, seed: rand(), row });
    };
    const tw = CFG.tileW * 0.955, tl = CFG.tileL * 0.965;
    for (let row = 0; row < level.length + CFG.runway; row++) {
      for (let lane = 0; lane < CFG.lanes; lane++) {
        const t = level.tile(row, lane);
        if (t === '.' || t === '*' || t === '+') continue;
        const x = level.laneCenter(lane), z = (row + 0.5) * CFG.tileL;
        if (t === '#') add(x, CFG.blockH / 2 - 0.25, z, tw, CFG.blockH + 0.5, tl, 1);
        else if (t === '|') add(x, -0.2, z, CFG.railHalf * 2, 0.4, CFG.tileL * 1.0, 8);
        else if (t === 'm') add(x, -0.25, z, tw, 0.5, tl, 6, row);
        else add(x, -0.25, z, tw, 0.5, tl, row >= level.length ? 4 : t === '^' ? 2 : t === '>' ? 3 : t === 'i' ? 7 : 0);
      }
    }
    // ---- gravity-flip zones: a deadly ceiling grid and a portal at each end ----
    for (const [from, to] of level.def.flips ?? []) {
      const y = CFG.flipCeil + 1.3;
      for (let row = from; row < to; row += 2) add(0, y, (row + 0.5) * CFG.tileL, ROAD_W + 5, 0.22, 0.22, 9);
      for (const side of [-1, 1]) add(side * (ROAD_W / 2 + 2.5), y, ((from + to) / 2) * CFG.tileL, 0.22, 0.22, (to - from) * CFG.tileL, 9);
      for (const [row, hex] of [[from, 0xffffff], [to, pal.accent]] as [number, number][]) {
        for (let k = 0; k < 3; k++) {
          const geo = new THREE.TorusGeometry(8.5 + k * 1.6, 0.2, 6, [40, 3, 5][k]);
          const m = new THREE.MeshBasicMaterial({ color: hdr(k === 0 ? hex : pal.edge, 1.3) });
          this.disposables.push(geo, m);
          const ring = new THREE.Mesh(geo, m);
          ring.position.set(0, 4, -row * CFG.tileL);
          this.spinners.push({ o: ring, s: [1.4, -2.2, 3][k] });
          this.group.add(ring);
        }
      }
    }
    this.group.add(this.instanced(box, mat, items));

    // ---- skyline --------------------------------------------------------
    const pillars: Item[] = [];
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
        pillars.push({ m, kind: 5, seed: rand(), row: 0 });
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
        if (!isGem(t)) continue;
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

    // ---- practice checkpoints: a pair of diamonds beside the road, shown in practice mode only ----
    this.markOff = hdr(pal.accent, 0.45);
    this.markOn = hdr(pal.accent, 1.7);
    const markGeo = new THREE.OctahedronGeometry(0.34);
    this.disposables.push(markGeo);
    for (const cp of level.checkpoints.slice(1)) {
      const mat = new THREE.MeshBasicMaterial({ color: this.markOff.clone() });
      this.disposables.push(mat);
      const g = new THREE.Group();
      for (const side of [-1, 1]) {
        const m = new THREE.Mesh(markGeo, mat);
        m.position.set(side * (ROAD_W / 2 + 0.9), 0.9, -cp.z);
        m.scale.set(1, 1.7, 1);
        g.add(m);
      }
      g.visible = false;
      this.marks.push({ g, z: cp.z, mat });
      this.group.add(g);
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

  }

  private instanced(geo: THREE.BufferGeometry, mat: THREE.Material, items: Item[]) {
    const g = geo.clone();
    this.disposables.push(g);
    const mesh = new THREE.InstancedMesh(g, mat, items.length);
    const kind = new Float32Array(items.length), seed = new Float32Array(items.length), row = new Float32Array(items.length);
    items.forEach((it, i) => { mesh.setMatrixAt(i, it.m); kind[i] = it.kind; seed[i] = it.seed; row[i] = it.row; });
    g.setAttribute('aRow', new THREE.InstancedBufferAttribute(row, 1));
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
  setPractice(on: boolean): void {
    for (const m of this.marks) { m.g.visible = on; m.mat.color.copy(this.markOff); }
  }
  /** Light every checkpoint marker up to `z`. */
  reach(z: number): void {
    for (const m of this.marks) m.mat.color.copy(m.z <= z + 0.01 ? this.markOn : this.markOff);
  }
  pulse(x: number, z: number): void {
    this.uniforms.uPulse.value.set(x, -z, 0);
  }

  update(dt: number, time: number, beat: number, shipZ: number, hype = 0, rec = 0, simT = 0, flip = 0): void {
    const u = this.uniforms;
    u.uHype.value = hype; u.uRec.value = rec; u.uSimT.value = simT; u.uFlip.value = flip;
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
