import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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
  if (aKind < 4.5 || (aKind > 5.5 && aKind < 9.5)) {
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
uniform float uTime, uBeat, uHype, uRec, uFlip, uCrate;
uniform vec3 uPulse; // x, z, age
vec3 hue(float h) { return 0.5 + 0.5 * cos(6.2832 * (h + vec3(0.0, 0.33, 0.67))); }
varying vec3 vLocal, vScale, vWorld;
varying float vKind, vSeed, vAhead;

// The beat grid drawn on the road: a line across the middle of every beat row (where the ship is when
// the beat sounds), brighter and in the accent colour on the first beat of a bar. It flashes on the beat.
vec3 beatLine() {
  float rowf = -vWorld.z / 4.0;
  float r = floor(rowf);
  if (mod(r, 3.0) > 0.5) return vec3(0.0);
  float bar = 1.0 - step(0.5, mod(r, 12.0));
  float w = 0.05 + 0.04 * bar;
  float line = smoothstep(w + 0.035, w, abs(fract(rowf) - 0.5)) * smoothstep(0.47, 0.4, abs(vLocal.x));
  // beats are a row of dashes, bar lines are solid
  line *= mix(step(0.5, fract(vLocal.x * 3.0 + 0.25)), 1.0, bar);
  return uAccent * line * (0.5 + 0.5 * bar) * (0.55 + 0.9 * uBeat) * smoothstep(130.0, 70.0, vAhead);
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
    if (top) base += uEdge * (0.03 * near + 0.04 * uBeat) + beatLine();
    ecol = mix(uEdge, hue(vAhead * 0.02 - uTime * 0.7) * 1.2, 0.8 * uRec);
    gain = (0.85 + 0.75 * near * (0.5 + 0.5 * wave) + 0.4 * uBeat) * (1.0 + 0.3 * uHype + 0.2 * uRec);
  } else if (vKind < 1.5 && uCrate > 0.5) {  // block drawn as a crate: dark face, inner frame, diamond emblem
    vec3 al = abs(vLocal);
    vec2 uv = al.x > 0.499 ? vLocal.zy * vScale.zy : al.y > 0.499 ? vLocal.xz * vScale.xz : vLocal.xy * vScale.xy;
    vec2 hs = (al.x > 0.499 ? vScale.zy : al.y > 0.499 ? vScale.xz : vScale.xy) * 0.5;
    float m = min(hs.x, hs.y);
    float frame = smoothstep(0.06, 0.0, abs(min(hs.x - abs(uv.x), hs.y - abs(uv.y)) - 0.22));
    float dm = (abs(uv.x) + abs(uv.y)) / m;
    float emblem = smoothstep(0.07, 0.0, abs(dm - 0.62)) + smoothstep(0.26, 0.2, dm);
    base = uBlock * (0.16 + 0.08 * uBeat) + uBlock * (frame * 0.9 + emblem * (1.1 + 0.6 * uBeat));
    ecol = uBlockEdge; gain = 2.0 + 0.9 * uBeat;
  } else if (vKind < 1.5) {     // block (obstacle)
    float stripes = step(0.5, fract((vWorld.x + vWorld.y) * 0.9 - uTime * 0.9));
    base = uBlock * (0.30 + 0.24 * stripes + 0.22 * uBeat);
    ecol = uBlockEdge; gain = 2.0 + 0.9 * uBeat;
  } else if (vKind < 2.5) {     // jump pad: square rings that pulse outwards (the arrows standing on it say "up")
    float d = max(abs(vLocal.x), abs(vLocal.z)) * 2.0;
    float ring = fract(d * 1.5 - uTime * 1.6);
    base = uAccent * 0.22;
    if (top) base += uAccent * (smoothstep(0.55, 0.7, ring) * smoothstep(1.0, 0.85, ring) * 1.3 + smoothstep(0.22, 0.12, d) * (0.8 + 0.8 * uBeat));
    ecol = uAccent; gain = 2.0 + 0.6 * uBeat;
  } else if (vKind < 3.5) {     // boost pad: one big arrow pointing forward, light streaming along it
    vec3 hot = mix(uEdge, vec3(1.0), 0.55);
    float f = -vLocal.z, ax = abs(vLocal.x);
    float head = step(0.0, f) * smoothstep(0.0, 0.03, (0.43 - f) * 0.95 - ax);
    float shaft = step(f, 0.0) * step(-0.43, f) * smoothstep(0.13, 0.1, ax);
    float stream = 0.55 + 0.45 * step(0.5, fract(f * 2.0 - uTime * 3.5));
    // a dark pad, so the arrow keeps its shape instead of blooming into a white slab
    base = uFloor * 0.12;
    if (top) base += hot * max(head, shaft) * stream * 0.95;
    ecol = hot; gain = 1.1;
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
    if (top) base += vec3(1.0) * spark * 0.8 + beatLine();
    ecol = vec3(0.75, 0.93, 1.0); gain = 0.95 + 0.35 * uBeat;
  } else if (vKind > 7.5 && vKind < 8.5) {   // rail: a bright narrow beam
    float run = 0.5 + 0.5 * sin(vWorld.z * 1.4 + uTime * 9.0);
    base = uEdge * (0.3 + 0.3 * run);
    ecol = uEdge; gain = 1.9 + 0.6 * uBeat;
  } else if (vKind > 8.5 && vKind < 9.5) {     // ceiling of a gravity-flip zone: obstacle colour, it kills
    // kept dim on purpose: the bars converge on the horizon and would bloom into a white blot over the road
    base = uBlock * (0.34 + 0.1 * sin(uTime * 4.0 + vWorld.z * 0.5));
    ecol = uBlockEdge; gain = 0.55;
  } else if (vKind > 9.5) {     // floating island (concept-art worlds): dark rock with a lit top rim
    float lit = top ? 1.0 : 0.0;
    float band = smoothstep(0.85, 0.95, fract(vWorld.y * 0.35 + vSeed * 5.0));
    base = uFloor * (0.22 + 0.18 * lit) + uGlow * band * 0.08 * (1.0 - lit);
    ecol = mix(uEdge, uGlow, step(0.6, vSeed)); gain = (top ? 1.1 : 0.35) + 0.5 * uBeat * vSeed;
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
  uSimT: THREE.IUniform<number>; uFlip: THREE.IUniform<number>; uCrate: THREE.IUniform<number>;
}

/** Flat-shaded triangles with a fixed light: crisp facets, no scene lights needed. */
function shaded(geo: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  const L = new THREE.Vector3(-0.4, 0.8, 0.45).normalize();
  const n = g.getAttribute('normal'), cols = new Float32Array(n.count * 3), v = new THREE.Vector3();
  for (let i = 0; i < n.count; i++) {
    v.fromBufferAttribute(n, i);
    const k = 0.35 + 0.75 * Math.max(0, v.dot(L));
    cols[i * 3] = color.r * k; cols[i * 3 + 1] = color.g * k; cols[i * 3 + 2] = color.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.deleteAttribute('uv');
  return g;
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
  private spikeMat?: THREE.LineBasicMaterial;
  private upArrows?: THREE.Mesh;
  private fwdArrows?: THREE.Mesh;
  private fwdBase = new THREE.Color();
  private spikeBase = new THREE.Color();
  private rings = false;

  constructor(level: Level, pal: Palette) {
    const col = (h: number) => ({ value: new THREE.Color(h) });
    this.uniforms = {
      uTime: { value: 0 }, uBeat: { value: 0 }, uShipZ: { value: 0 },
      uPulse: { value: new THREE.Vector3(0, 0, 99) }, uHype: { value: 0 }, uRec: { value: 0 }, uSimT: { value: 0 }, uFlip: { value: 0 },
      uFloor: col(pal.floor), uEdge: col(pal.edge), uBlock: col(pal.block), uBlockEdge: col(pal.blockEdge),
      uAccent: col(pal.accent), uFog: col(pal.fog), uGlow: col(pal.glow), uCrate: { value: pal.look?.crate ? 1 : 0 },
    };
    const look = pal.look ?? {};
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
        // air block: a block floating over the road, driven under
        if (t === 'n') add(x, (CFG.airLo + CFG.airHi) / 2, z, tw, CFG.airHi - CFG.airLo, tl, 1);
      }
    }
    // ---- spikes: two pyramids per tile, in the obstacle colour, with bright edges ----
    const spikeParts: THREE.BufferGeometry[] = [], spikeEdges: THREE.BufferGeometry[] = [];
    const pyramid = new THREE.ConeGeometry(0.98, 1.2, 4, 1);
    pyramid.rotateY(Math.PI / 4);
    pyramid.translate(0, 0.6, 0);
    const pyrEdges = new THREE.EdgesGeometry(pyramid);
    const spikeCol = new THREE.Color(pal.block).multiplyScalar(0.55);
    for (let row = 0; row < level.length; row++) {
      for (let lane = 0; lane < CFG.lanes; lane++) {
        if (level.tile(row, lane) !== 'x') continue;
        for (const dz of [-0.97, 0.97]) {
          const m = new THREE.Matrix4().makeTranslation(level.laneCenter(lane), 0, -((row + 0.5) * CFG.tileL + dz));
          spikeParts.push(shaded(pyramid.clone().applyMatrix4(m), spikeCol));
          spikeEdges.push(pyrEdges.clone().applyMatrix4(m));
        }
      }
    }
    pyramid.dispose(); pyrEdges.dispose();
    if (spikeParts.length) {
      const g = mergeGeometries(spikeParts)!, e = mergeGeometries(spikeEdges)!;
      spikeParts.forEach((x) => x.dispose()); spikeEdges.forEach((x) => x.dispose());
      const fm = new THREE.MeshBasicMaterial({ vertexColors: true });
      const em = new THREE.LineBasicMaterial({ color: hdr(pal.blockEdge, 2.2) });
      this.disposables.push(g, e, fm, em);
      const mesh = new THREE.Mesh(g, fm);
      mesh.add(new THREE.LineSegments(e, em));
      mesh.frustumCulled = false;
      this.spikeMat = em;
      this.spikeBase.copy(em.color);
      this.group.add(mesh);
    }

    // ---- pad signs: what a pad does has to read from far away and at speed ----
    // Jump pad: a big solid arrow pointing up stands on every pad tile, on a dark backing so it shows
    // against any sky. Boost pad: boards of chevrons pointing forward stand along both sides of the pad.
    const ups: THREE.BufferGeometry[] = [], upBacks: THREE.BufferGeometry[] = [], fwd: THREE.BufferGeometry[] = [], fwdBacks: THREE.BufferGeometry[] = [];
    const poly = (pts: number[][]): THREE.ShapeGeometry => {
      const sh = new THREE.Shape();
      pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
      sh.closePath();
      return new THREE.ShapeGeometry(sh);
    };
    const arrowGeo = poly([[0, 2.5], [0.95, 1.35], [0.36, 1.35], [0.36, 0], [-0.36, 0], [-0.36, 1.35], [-0.95, 1.35]]);
    const arrowBack = poly([[0, 2.85], [1.4, 1.17], [0.54, 1.17], [0.54, -0.16], [-0.54, -0.16], [-0.54, 1.17], [-1.4, 1.17]]);
    // one chevron, pointing along +x here; turned to point down the road below
    const chev = poly([[0, 0], [0.55, 0], [1.25, 0.75], [0.55, 1.5], [0, 1.5], [0.7, 0.75]]);
    const chevBack = poly([[-0.25, -0.18], [0.65, -0.18], [1.55, 0.75], [0.65, 1.68], [-0.25, 1.68], [0.45, 0.75]]);
    const turn = new THREE.Matrix4().makeRotationY(Math.PI / 2);
    for (let row = 0; row < level.length; row++) {
      let lo = -1, hi = -1;
      for (let lane = 0; lane < CFG.lanes; lane++) {
        const t = level.tile(row, lane);
        if (t === '>') { if (lo < 0) lo = lane; hi = lane; }
        if (t !== '^') continue;
        const m = new THREE.Matrix4().makeTranslation(level.laneCenter(lane), 0.45, -(row + 0.5) * CFG.tileL);
        ups.push(arrowGeo.clone().applyMatrix4(m));
        upBacks.push(arrowBack.clone().applyMatrix4(m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, -0.06))));
      }
      if (lo < 0) continue;
      for (const [x, away] of [[level.laneCenter(lo) - CFG.tileW / 2 - 0.25, -0.06], [level.laneCenter(hi) + CFG.tileW / 2 + 0.25, 0.06]]) {
        for (let k = 0; k < 3; k++) {
          const at = new THREE.Matrix4().makeTranslation(x, 0.35, -(row * CFG.tileL + 0.2 + k * 1.3));
          fwd.push(chev.clone().applyMatrix4(turn).applyMatrix4(at));
          fwdBacks.push(chevBack.clone().applyMatrix4(turn).applyMatrix4(at.clone().multiply(new THREE.Matrix4().makeTranslation(away, 0, 0))));
        }
      }
    }
    [arrowGeo, arrowBack, chev, chevBack].forEach((g) => g.dispose());
    const sign = (parts: THREE.BufferGeometry[], color: THREE.Color, opacity: number): THREE.Mesh | undefined => {
      if (!parts.length) return undefined;
      const g = mergeGeometries(parts)!;
      parts.forEach((x) => x.dispose());
      const m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, side: THREE.DoubleSide });
      this.disposables.push(g, m);
      const mesh = new THREE.Mesh(g, m);
      mesh.frustumCulled = false;
      this.group.add(mesh);
      return mesh;
    };
    const dark = new THREE.Color(0x04041a);
    const upBack = sign(upBacks, dark, 0.8);
    this.upArrows = sign(ups, hdr(pal.accent, 1.7), 1);
    if (upBack && this.upArrows) this.upArrows.add(upBack);
    sign(fwdBacks, dark, 0.8);
    this.fwdArrows = sign(fwd, new THREE.Color(pal.edge).lerp(new THREE.Color(0xffffff), 0.6).multiplyScalar(1.7), 1);
    if (this.fwdArrows) this.fwdBase.copy((this.fwdArrows.material as THREE.MeshBasicMaterial).color);

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
    if (look.islands) {
      // floating islands: a lit slab with a rocky underside that narrows in steps
      const island = (x: number, y: number, z: number, w: number, d: number) => {
        const seed = rand();
        let ww = w, dd = d, yy = y;
        pillars.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(x, yy - 0.6, -z), new THREE.Quaternion(), new THREE.Vector3(ww, 1.2, dd)), kind: 10, seed, row: 0 });
        yy -= 1.2;
        for (let k = 0; k < 3; k++) {
          ww *= 0.55 + rand() * 0.2; dd *= 0.55 + rand() * 0.2;
          const h = 1.4 + rand() * 2.4;
          pillars.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(x + (rand() - 0.5) * ww * 0.3, yy - h / 2, -z), new THREE.Quaternion(), new THREE.Vector3(ww, h, dd)), kind: 10, seed, row: 0 });
          yy -= h;
        }
        if (rand() < 0.55) {
          const h = 4 + rand() * 10, sw = 0.8 + rand() * 1.4;
          pillars.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(x + (rand() - 0.5) * w * 0.5, y + h / 2, -z), new THREE.Quaternion(), new THREE.Vector3(sw, h, sw)), kind: 10, seed, row: 0 });
        }
      };
      for (let z = -30; z < total; z += 15) {
        for (const side of [-1, 1]) {
          // a ledge right beside the road, like the side platforms in the concept art
          // kept well below and away from the road so it never reads as a lane you could drive on
          if (rand() < 0.45) island(side * (ROAD_W / 2 + 9 + rand() * 6), -3.2 - rand() * 2.5, z + rand() * 8, 6 + rand() * 6, 8 + rand() * 10);
          island(side * (24 + rand() * 30), -6 + rand() * 18, z + rand() * 10, 8 + rand() * 12, 8 + rand() * 12);
        }
      }
      // a far skyline of thin spires on the horizon
      for (let z = 60; z < total + 120; z += 11) {
        for (const side of [-1, 1]) {
          const x = side * (60 + rand() * 60), h = 20 + rand() * 60, wdt = 2 + rand() * 4;
          pillars.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(x, -14 + h / 2, -(z + rand() * 6)), new THREE.Quaternion(), new THREE.Vector3(wdt, h, wdt)), kind: 5, seed: rand(), row: 0 });
        }
      }
    }
    for (let z = -40; z < total && !look.islands; z += 7) {
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
    this.rings = !!look.rings;
    const gemGeo = look.rings ? new THREE.TorusGeometry(0.42, 0.12, 8, 24) : new THREE.OctahedronGeometry(0.42);
    const gemMat = new THREE.MeshBasicMaterial({ color: hdr(pal.gem, 1.7) });
    const gemEdge = new THREE.LineBasicMaterial({ color: hdr(0xffffff, 1.6) });
    const gemEdges = new THREE.EdgesGeometry(gemGeo);
    this.disposables.push(gemGeo, gemMat, gemEdge, gemEdges);
    for (let row = 0; row < level.length; row++) {
      for (let lane = 0; lane < CFG.lanes; lane++) {
        const t = level.tile(row, lane);
        if (!isGem(t)) continue;
        const g = new THREE.Mesh(gemGeo, gemMat);
        if (!look.rings) g.add(new THREE.LineSegments(gemEdges, gemEdge));
        g.position.set(level.laneCenter(lane), gemHeight(t) + 0.15, -(row + 0.5) * CFG.tileL);
        if (!look.rings) g.scale.set(1, 1.35, 1);
        this.gems.set(row * CFG.lanes + lane, g);
        this.group.add(g);
      }
    }

    // ---- gates the road flies through -------------------------------------
    const gateCols = [pal.edge, pal.glow, pal.accent];
    if (look.islands) {
      // segmented ring portals standing beside the road
      const seg = new THREE.BoxGeometry(1.1, 0.5, 0.5);
      const segA = new THREE.MeshBasicMaterial({ color: hdr(0xffffff, 1.5) }), segB = new THREE.MeshBasicMaterial({ color: hdr(pal.glow, 1.6) });
      const disc = new THREE.RingGeometry(3.2, 3.6, 40);
      const discM = new THREE.MeshBasicMaterial({ color: hdr(pal.glow, 0.9), side: THREE.DoubleSide });
      this.disposables.push(seg, segA, segB, disc, discM);
      for (let z = 50, i = 0; z < level.finishZ + 60; z += 70 + rand() * 40, i++) {
        const side = i % 2 ? 1 : -1;
        const ring = new THREE.Group();
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2;
          const b = new THREE.Mesh(seg, k % 2 ? segA : segB);
          b.position.set(Math.cos(a) * 4.3, Math.sin(a) * 4.3, 0);
          b.rotation.z = a + Math.PI / 2;
          ring.add(b);
        }
        ring.add(new THREE.Mesh(disc, discM));
        const holder = new THREE.Group();
        holder.position.set(side * (ROAD_W / 2 + 12 + rand() * 10), 4 + rand() * 6, -z);
        holder.rotation.y = side * 0.5;
        holder.add(ring);
        this.spinners.push({ o: ring, s: side * 0.6 });
        this.group.add(holder);
      }
      // spiked suns: dark star discs with a hot core, far beside the road (decoration: no obstacle colour)
      const star = new THREE.Shape();
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2, r = k % 2 ? 2.1 : 3.0;
        if (k === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r); else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      const starGeo = new THREE.ShapeGeometry(star);
      const starM = new THREE.MeshBasicMaterial({ color: 0x0a0618, side: THREE.DoubleSide });
      const starRim = new THREE.LineBasicMaterial({ color: hdr(0xff8a2a, 1.4) });
      const starEdge = new THREE.EdgesGeometry(starGeo);
      const coreGeo = new THREE.RingGeometry(0.55, 0.95, 32), coreM = new THREE.MeshBasicMaterial({ color: hdr(0xffa21a, 2.2), side: THREE.DoubleSide });
      const dotGeo = new THREE.CircleGeometry(0.4, 24), dotM = new THREE.MeshBasicMaterial({ color: hdr(0xfff27a, 2), side: THREE.DoubleSide });
      this.disposables.push(starGeo, starM, starRim, starEdge, coreGeo, coreM, dotGeo, dotM);
      for (let z = 90, i = 0; z < level.finishZ + 80; z += 130 + rand() * 60, i++) {
        const side = i % 2 ? -1 : 1;
        const g = new THREE.Group();
        const body = new THREE.Mesh(starGeo, starM);
        body.add(new THREE.LineSegments(starEdge, starRim));
        g.add(body);
        const core = new THREE.Mesh(coreGeo, coreM); core.position.z = 0.02; g.add(core);
        const dot = new THREE.Mesh(dotGeo, dotM); dot.position.z = 0.03; g.add(dot);
        g.position.set(side * (26 + rand() * 18), 12 + rand() * 10, -z);
        g.scale.setScalar(1.3 + rand() * 1.2);
        this.spinners.push({ o: body, s: side * 1.2 });
        this.group.add(g);
      }
    }
    for (let z = 70, i = 0; z < level.finishZ - 30 && !look.islands; z += 96, i++) {
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
    if (this.spikeMat) this.spikeMat.color.copy(this.spikeBase).multiplyScalar(0.8 + 0.5 * beat);
    // jump arrows hop upwards on a loop; boost chevrons flash fast, like a running light
    if (this.upArrows) { const k = (time * 1.6) % 1; this.upArrows.position.y = 0.55 * (1 - (1 - k) * (1 - k)); }
    if (this.fwdArrows) (this.fwdArrows.material as THREE.MeshBasicMaterial).color.copy(this.fwdBase).multiplyScalar(0.65 + 0.35 * Math.sign(Math.sin(time * 14)));
    for (const sp of this.spinners) sp.o.rotation.z += sp.s * dt;
    const s = 1 + beat * 0.06;
    this.portal.scale.set(s, s, 1);
    for (const g of this.gems.values()) {
      if (!g.visible) continue;
      const d = -g.position.z - shipZ;
      if (d < -10 || d > 170) continue;
      const k = 1 + beat * 0.22;
      if (this.rings) {
        g.rotation.y = Math.sin(time * 2.2 + g.position.z) * 0.6;
        g.scale.setScalar(k);
      } else {
        g.rotation.y = time * 2.4 + g.position.z;
        g.scale.set(k, 1.35 * k, k);
      }
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
