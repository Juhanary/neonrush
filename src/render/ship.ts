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

export const SHIPS: Record<string, ShipFactory> = { dart: () => dart(STEALTH) };
export const DEFAULT_SHIP = 'dart';
