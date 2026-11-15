import * as THREE from 'three';
/**
 * A ship's looks only. Movement lives in core/sim.ts and never touches this file.
 * A ship never takes colours from the track: it looks the same in every world.
 * Each craft is assembled from parts (hull, pods, wings, fins, canopy) painted from one Paint,
 * so later customisation can swap a part builder or a paint without touching the rest.
 */
export interface ShipVisual {
  root: THREE.Group;
  /** Thruster exits in ship-local space (trails and exhaust start here). */
  thrusters: THREE.Vector3[];
  /** power: 0 idle .. 1 cruising .. 2 boosting */
  update(time: number, power: number): void;
  /** Colours of everything the ship emits: trail ribbons, exhaust, jump and landing sparks. */
  trail: THREE.Color;
  exhaust: THREE.Color;
  dispose(): void;
}

export type ShipFactory = () => ShipVisual;

/** Every colour on a ship. Hull colours stay under the bloom threshold so the facets and outlines stay sharp. */
export interface Paint {
  hull: number; panel: number; canopy: number;
  /** Outline drawn on every facet edge. */
  edge: number;
  /** Light strips and fin tips. */
  accent: number;
  /** Thruster core, glow and trail. */
  engine: number;
}

export const STEALTH: Paint = { hull: 0x171c30, panel: 0x0c0f1c, canopy: 0x1f5cff, edge: 0xe6eeff, accent: 0x6aa8ff, engine: 0x4f8dff };
/** The concept-art paint: dark indigo hull, cyan outlines and lights, magenta engines. */
export const NEON: Paint = { hull: 0x232a66, panel: 0x141844, canopy: 0x2ee8ff, edge: 0x5aeeff, accent: 0x2ee8ff, engine: 0xff3ad8 };

function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Flat-shaded triangles with the shading baked into vertex colours. No scene lights are involved,
 * so facets stay crisp and never get bright enough to bloom.
 */
function tris(points: number[][], faces: number[][], base: THREE.Color): THREE.BufferGeometry {
  const v: number[] = [];
  for (const f of faces) for (const i of f) v.push(...points[i]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  const light = new THREE.Vector3(-0.35, 0.85, 0.4).normalize();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  const col: number[] = [];
  for (let i = 0; i < v.length; i += 9) {
    a.fromArray(v, i); b.fromArray(v, i + 3); c.fromArray(v, i + 6);
    n.copy(b).sub(a).cross(c.sub(a)).normalize();
    if (n.y < 0 && Math.abs(n.y) > 0.5) n.negate(); // faces are drawn double sided: light the upper side
    const shade = 0.24 + 0.72 * Math.max(0, n.dot(light)) + 0.1 * Math.max(0, n.y); // wide range: every facet reads
    for (let k = 0; k < 3; k++) col.push(base.r * shade, base.g * shade, base.b * shade);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/** Default craft: a dark dart hull between two engine pods, with canted fins. */
function dart(paint: Paint): ShipVisual {
  const root = new THREE.Group();
  const trash: { dispose(): void }[] = [];
  const lineMat = new THREE.LineBasicMaterial({ color: new THREE.Color(paint.edge).multiplyScalar(0.9) });
  const flatMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const accentMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(paint.accent).multiplyScalar(1.5), side: THREE.DoubleSide });
  trash.push(lineMat, flatMat, accentMat);
  const part = (points: number[][], faces: number[][], colour: number, outline = true) => {
    const geo = tris(points, faces, new THREE.Color(colour));
    const m = new THREE.Mesh(geo, flatMat);
    trash.push(geo);
    if (outline) {
      const e = new THREE.EdgesGeometry(geo, 12);
      m.add(new THREE.LineSegments(e, lineMat));
      trash.push(e);
    }
    root.add(m);
    return m;
  };
  const strip = (points: number[][]) => {
    const g = new THREE.BufferGeometry();
    const [a, b, c, d] = points;
    g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
    trash.push(g);
    root.add(new THREE.Mesh(g, accentMat));
  };

  // ---- hull (forward is -Z) ----------------------------------------------
  //         0 nose      1,2 shoulders                3,4 widest               5 brow        6 spine
  const H = [[0, 0.02, -1.55], [-0.3, 0.03, -0.35], [0.3, 0.03, -0.35], [-0.46, 0, 0.5], [0.46, 0, 0.5], [0, 0.2, -0.62], [0, 0.34, 0.3],
    //       7,8 tail corners                        9 tail top      10 keel
    [-0.3, 0.08, 0.92], [0.3, 0.08, 0.92], [0, 0.2, 0.98], [0, -0.17, 0.15]];
  part(H, [
    [0, 1, 5], [0, 5, 2], [1, 3, 6], [1, 6, 5], [2, 5, 6], [2, 6, 4], [3, 7, 6], [4, 6, 8], [7, 9, 6], [8, 6, 9],
    [0, 10, 1], [0, 2, 10], [1, 10, 3], [2, 4, 10], [3, 10, 7], [4, 8, 10], [7, 10, 8], [7, 8, 9],
  ], paint.hull);
  // spine light
  strip([[-0.04, 0.232, -0.5], [0.04, 0.232, -0.5], [0.04, 0.352, 0.28], [-0.04, 0.352, 0.28]]);
  // tail light bar
  strip([[-0.2, 0.105, 0.945], [0.2, 0.105, 0.945], [0.1, 0.15, 0.967], [-0.1, 0.15, 0.967]]);

  // ---- canopy ------------------------------------------------------------
  part([[0, 0.17, -0.95], [-0.15, 0.2, -0.42], [0.15, 0.2, -0.42], [0, 0.36, -0.36], [0, 0.31, 0.02]],
    [[0, 1, 3], [0, 3, 2], [1, 4, 3], [2, 3, 4]], paint.canopy);

  const thrusters: THREE.Vector3[] = [];
  const glows: THREE.Sprite[] = [];
  const tex = glowTexture();
  const hot = new THREE.Color(paint.engine);
  const coreGeo = new THREE.CircleGeometry(0.105, 6);
  const coreMat = new THREE.MeshBasicMaterial({ color: hot.clone().lerp(new THREE.Color(1, 1, 1), 0.6).multiplyScalar(2.2), side: THREE.DoubleSide });
  const glowMat = new THREE.SpriteMaterial({ map: tex, color: hot.clone().multiplyScalar(0.8), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  trash.push(tex, coreGeo, coreMat, glowMat);

  for (const s of [-1, 1]) {
    // ---- engine pod: a tapered six-sided spike ---------------------------
    const px = s * 0.84, w = 0.15;
    const P = [[px, 0.03, -0.72],
      [px - w, 0.04, -0.05], [px, 0.2, -0.05], [px + w, 0.04, -0.05], [px, -0.1, -0.05],
      [px - w * 0.85, 0.04, 0.8], [px, 0.17, 0.8], [px + w * 0.85, 0.04, 0.8], [px, -0.08, 0.8]];
    part(P, [
      [0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 1],
      [1, 5, 6], [1, 6, 2], [2, 6, 7], [2, 7, 3], [3, 7, 8], [3, 8, 4], [4, 8, 5], [4, 5, 1],
    ], paint.hull);
    // ---- wing plate between hull and pod, with a lit leading edge ----------
    const W = [[s * 0.3, 0.04, -0.3], [s * 0.72, 0.05, -0.08], [s * 0.72, 0.03, 0.62], [s * 0.42, 0.02, 0.6]];
    part(W, [[0, 1, 2], [0, 2, 3]], paint.panel);
    strip([[s * 0.3, 0.052, -0.3], [s * 0.72, 0.062, -0.08], [s * 0.72, 0.062, 0.03], [s * 0.3, 0.052, -0.19]]);
    // ---- canted fin ------------------------------------------------------
    const F = [[px, 0.17, 0.2], [px, 0.15, 0.8], [px + s * 0.2, 0.5, 0.9], [px + s * 0.17, 0.46, 0.62]];
    part(F, [[0, 1, 2], [0, 2, 3]], paint.panel);
    strip([[px + s * 0.2, 0.5, 0.9], [px + s * 0.17, 0.46, 0.62], [px + s * 0.13, 0.39, 0.64], [px + s * 0.16, 0.42, 0.89]]);
    // ---- thruster ----------------------------------------------------------
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.set(px, 0.045, 0.805);
    root.add(core);
    const glow = new THREE.Sprite(glowMat);
    glow.position.set(px, 0.045, 0.98);
    root.add(glow);
    glows.push(glow);
    thrusters.push(new THREE.Vector3(px, 0.045, 0.92));
  }

  // faint hover light under the hull, so the craft reads as floating
  const underMat = new THREE.SpriteMaterial({ map: tex, color: hot.clone().multiplyScalar(0.16), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  trash.push(underMat);
  const under = new THREE.Sprite(underMat);
  under.position.set(0, -0.42, 0.1);
  root.add(under);

  const SCALE = 1.2;
  root.scale.setScalar(SCALE);
  for (const t of thrusters) t.multiplyScalar(SCALE);
  return {
    root, thrusters,
    trail: hot.clone().lerp(new THREE.Color(1, 1, 1), 0.15).multiplyScalar(1.2),
    exhaust: hot.clone().multiplyScalar(0.6),
    update(time, power) {
      const f = 0.85 + 0.15 * Math.sin(time * 47) + 0.1 * Math.sin(time * 31.7);
      const s = (0.16 + 0.13 * power) * f;
      for (const g of glows) g.scale.set(s, s, 1);
      under.scale.set(1.9 + 0.2 * Math.sin(time * 6), 0.6, 1);
    },
    dispose() { for (const t of trash) t.dispose(); },
  };
}

/**
 * Default craft, after the concept art: a broad fuselage with a raised cockpit and a cyan visor slot,
 * stepped swept wings, and two big round engines under the wing roots that burn magenta.
 */
function nova(paint: Paint): ShipVisual {
  const root = new THREE.Group();
  const trash: { dispose(): void }[] = [];
  const lineMat = new THREE.LineBasicMaterial({ color: new THREE.Color(paint.edge).multiplyScalar(0.95) });
  const flatMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const accentMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(paint.accent).multiplyScalar(1.6), side: THREE.DoubleSide });
  trash.push(lineMat, flatMat, accentMat);
  const part = (points: number[][], faces: number[][], colour: number, outline = true) => {
    const geo = tris(points, faces, new THREE.Color(colour));
    const m = new THREE.Mesh(geo, flatMat);
    trash.push(geo);
    if (outline) {
      const e = new THREE.EdgesGeometry(geo, 14);
      m.add(new THREE.LineSegments(e, lineMat));
      trash.push(e);
    }
    root.add(m);
    return m;
  };
  /** A lit quad (cyan light strip), given its four corners. */
  const strip = (q: number[][]) => {
    const g = new THREE.BufferGeometry();
    const [a, b, c, d] = q;
    g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
    trash.push(g);
    root.add(new THREE.Mesh(g, accentMat));
  };

  // ---- fuselage (forward is -Z): flat wide nose, widest at the wing roots, squared tail ----
  //        0 nose L         1 nose R        2 cheek L          3 cheek R          4 waist L        5 waist R
  const B = [[-0.2, 0.04, -1.3], [0.2, 0.04, -1.3], [-0.42, 0.06, -0.55], [0.42, 0.06, -0.55], [-0.55, 0.05, 0.35], [0.55, 0.05, 0.35],
    //  6 tail L          7 tail R          8 top front      9 top back       10 keel
    [-0.42, 0.1, 0.95], [0.42, 0.1, 0.95], [0, 0.2, -0.9], [0, 0.3, 0.85], [0, -0.16, 0.0]];
  part(B, [
    [0, 8, 1], [0, 2, 8], [1, 8, 3], [2, 4, 9], [2, 9, 8], [3, 8, 9], [3, 9, 5], [4, 6, 9], [5, 9, 7], [6, 7, 9],
    [0, 1, 10], [0, 10, 2], [1, 3, 10], [2, 10, 4], [3, 5, 10], [4, 10, 6], [5, 7, 10], [6, 10, 7],
  ], paint.hull);

  // ---- cockpit hump with the visor slot on its front face ----
  const C = [[-0.26, 0.17, -0.78], [0.26, 0.17, -0.78], [-0.3, 0.26, -0.05], [0.3, 0.26, -0.05],
    [-0.2, 0.42, -0.6], [0.2, 0.42, -0.6], [-0.22, 0.46, -0.1], [0.22, 0.46, -0.1], [0, 0.3, 0.45]];
  part(C, [[0, 1, 5], [0, 5, 4], [4, 5, 7], [4, 7, 6], [0, 4, 6], [0, 6, 2], [1, 7, 5], [1, 3, 7], [2, 6, 8], [3, 8, 7], [6, 7, 8]], paint.panel);
  strip([[-0.15, 0.255, -0.735], [0.15, 0.255, -0.735], [0.12, 0.37, -0.64], [-0.12, 0.37, -0.64]]);
  // the cockpit window on top of the hump, seen from the chase camera
  strip([[-0.13, 0.433, -0.5], [0.13, 0.433, -0.5], [0.15, 0.468, -0.22], [-0.15, 0.468, -0.22]]);
  // a cyan U on the tail, like the trim in the concept art
  strip([[-0.22, 0.2, 0.62], [-0.13, 0.215, 0.6], [-0.13, 0.262, 0.86], [-0.22, 0.24, 0.86]]);
  strip([[0.22, 0.2, 0.62], [0.13, 0.215, 0.6], [0.13, 0.262, 0.86], [0.22, 0.24, 0.86]]);
  strip([[-0.22, 0.24, 0.86], [0.22, 0.24, 0.86], [0.22, 0.225, 0.93], [-0.22, 0.225, 0.93]]);

  const thrusters: THREE.Vector3[] = [];
  const glows: THREE.Sprite[] = [];
  const tex = glowTexture();
  const hot = new THREE.Color(paint.engine);
  const ringGeo = new THREE.RingGeometry(0.12, 0.2, 18);
  const ringMat = new THREE.MeshBasicMaterial({ color: hot.clone().multiplyScalar(2.4), side: THREE.DoubleSide });
  const coreGeo = new THREE.CircleGeometry(0.13, 18);
  const coreMat = new THREE.MeshBasicMaterial({ color: hot.clone().lerp(new THREE.Color(1, 1, 1), 0.75).multiplyScalar(2.6), side: THREE.DoubleSide });
  const glowMat = new THREE.SpriteMaterial({ map: tex, color: hot.clone().multiplyScalar(1.1), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  trash.push(tex, ringGeo, ringMat, coreGeo, coreMat, glowMat);

  for (const s of [-1, 1]) {
    // ---- stepped swept wing with a raised ridge ----
    const W = [[s * 0.45, 0.07, -0.5], [s * 0.9, 0.05, -0.2], [s * 0.92, 0.05, -0.06], [s * 1.55, -0.04, 0.22],
      [s * 1.5, -0.04, 0.56], [s * 1.0, 0.02, 0.5], [s * 0.55, 0.07, 0.72], [s * 0.85, 0.14, 0.18]];
    part(W, [[0, 1, 7], [1, 2, 7], [2, 3, 7], [3, 4, 7], [4, 5, 7], [5, 6, 7], [6, 0, 7]], paint.hull);
    // underside, slightly lower, so the wing has thickness
    part(W.map(([x, y, z]) => [x, y - 0.07, z]), [[0, 7, 1], [1, 7, 2], [2, 7, 3], [3, 7, 4], [4, 7, 5], [5, 7, 6], [6, 7, 0]], paint.panel, false);
    // lit leading edge and tip
    strip([[s * 0.45, 0.075, -0.5], [s * 0.9, 0.055, -0.2], [s * 0.9, 0.06, -0.12], [s * 0.47, 0.078, -0.4]]);
    strip([[s * 0.92, 0.055, -0.06], [s * 1.55, -0.035, 0.22], [s * 1.53, -0.03, 0.31], [s * 0.94, 0.06, 0.04]]);

    // ---- engine: a six-sided nacelle under the wing root with a big round exhaust ----
    const ex = s * 0.62, ey = -0.04, r = 0.24;
    const ring = (z: number, k: number) => Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      return [ex + Math.cos(a) * r * k, ey + Math.sin(a) * r * k, z];
    });
    const N = [[ex, ey, -0.5], ...ring(0.0, 0.85), ...ring(0.95, 1)];
    const faces: number[][] = [];
    for (let i = 0; i < 6; i++) {
      const a = 1 + i, b = 1 + ((i + 1) % 6), c = 7 + i, d = 7 + ((i + 1) % 6);
      faces.push([0, a, b], [a, c, d], [a, d, b]);
    }
    part(N, faces, paint.hull);
    const rim = new THREE.Mesh(ringGeo, ringMat);
    rim.position.set(ex, ey, 0.955);
    root.add(rim);
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.set(ex, ey, 0.95);
    root.add(core);
    const glow = new THREE.Sprite(glowMat);
    glow.position.set(ex, ey, 1.12);
    root.add(glow);
    glows.push(glow);
    thrusters.push(new THREE.Vector3(ex, ey, 1.02));
  }

  const underMat = new THREE.SpriteMaterial({ map: tex, color: hot.clone().multiplyScalar(0.18), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  trash.push(underMat);
  const under = new THREE.Sprite(underMat);
  under.position.set(0, -0.45, 0.2);
  root.add(under);

  const SCALE = 1.15;
  root.scale.setScalar(SCALE);
  for (const t of thrusters) t.multiplyScalar(SCALE);
  return {
    root, thrusters,
    trail: hot.clone().lerp(new THREE.Color(1, 1, 1), 0.3).multiplyScalar(1.3),
    exhaust: hot.clone().multiplyScalar(0.7),
    update(time, power) {
      const f = 0.85 + 0.15 * Math.sin(time * 47) + 0.1 * Math.sin(time * 31.7);
      const sz = (0.3 + 0.2 * power) * f;
      for (const g of glows) g.scale.set(sz, sz, 1);
      under.scale.set(2.1 + 0.2 * Math.sin(time * 6), 0.65, 1);
    },
    dispose() { for (const t of trash) t.dispose(); },
  };
}

export const SHIPS: Record<string, ShipFactory> = { nova: () => nova(NEON), dart: () => dart(STEALTH) };
export const DEFAULT_SHIP = 'nova';
