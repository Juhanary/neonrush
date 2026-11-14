import * as THREE from 'three';
import type { Palette } from './palette';

/**
 * A ship's looks only. Movement lives in core/sim.ts and never touches this file,
 * so new bodies are added by registering another factory in SHIPS.
 */
export interface ShipVisual {
  root: THREE.Group;
  /** Thruster exits in ship-local space (trails and exhaust start here). */
  thrusters: THREE.Vector3[];
  /** power: 0 idle .. 1 cruising .. 2 boosting */
  update(time: number, power: number): void;
  dispose(): void;
}

export type ShipFactory = (pal: Palette) => ShipVisual;

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

function tris(points: number[][], faces: number[][]): THREE.BufferGeometry {
  const v: number[] = [];
  for (const f of faces) for (const i of f) v.push(...points[i]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

/** Default craft: a low arrowhead hull with swept wings and twin thrusters. */
const arrowhead: ShipFactory = (pal) => {
  const root = new THREE.Group();
  const trash: { dispose(): void }[] = [];
  const edgeCol = new THREE.Color(pal.edge).multiplyScalar(2.0);
  const lineMat = new THREE.LineBasicMaterial({ color: edgeCol });
  const hullMat = new THREE.MeshStandardMaterial({
    color: 0x8f9be0, metalness: 0.25, roughness: 0.4, flatShading: true, side: THREE.DoubleSide,
    emissive: new THREE.Color(pal.edge).multiplyScalar(0.16),
  });
  trash.push(lineMat, hullMat);
  const outlined = (geo: THREE.BufferGeometry, mat: THREE.Material = hullMat) => {
    const m = new THREE.Mesh(geo, mat);
    const e = new THREE.EdgesGeometry(geo, 20);
    m.add(new THREE.LineSegments(e, lineMat));
    trash.push(geo, e);
    root.add(m);
    return m;
  };

  // hull: nose, left, right, top, bottom, tail   (forward is -Z)
  const P = [[0, 0.04, -1.3], [-0.52, 0.0, 0.5], [0.52, 0.0, 0.5], [0, 0.4, 0.2], [0, -0.16, 0.25], [0, 0.12, 0.85]];
  outlined(tris(P, [[0, 1, 3], [0, 3, 2], [1, 5, 3], [3, 5, 2], [0, 4, 1], [0, 2, 4], [1, 4, 5], [4, 2, 5]]));

  // wings
  for (const s of [-1, 1]) {
    const W = [[s * 0.42, 0.02, -0.15], [s * 1.0, -0.04, 0.72], [s * 0.42, 0.02, 0.62], [s * 0.5, 0.1, 0.4]];
    outlined(tris(W, [[0, 1, 3], [3, 1, 2], [0, 2, 1], [0, 3, 2]]));
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.26, 0.5),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(pal.accent).multiplyScalar(1.8) }));
    fin.position.set(s * 1.0, 0.06, 0.62);
    trash.push(fin.geometry, fin.material as THREE.Material);
    root.add(fin);
  }

  // cockpit
  const cockpitGeo = new THREE.OctahedronGeometry(0.2);
  const cockpitMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(pal.accent).multiplyScalar(1.5) });
  const cockpit = new THREE.Mesh(cockpitGeo, cockpitMat);
  cockpit.position.set(0, 0.27, -0.2);
  cockpit.scale.set(0.8, 0.5, 1.9);
  trash.push(cockpitGeo, cockpitMat);
  root.add(cockpit);

  // thrusters
  const tex = glowTexture();
  const hot = new THREE.Color(pal.trail);
  const nozzleGeo = new THREE.CylinderGeometry(0.17, 0.13, 0.4, 8);
  const coreGeo = new THREE.CircleGeometry(0.13, 12);
  const coreMat = new THREE.MeshBasicMaterial({ color: hot.clone().lerp(new THREE.Color(1, 1, 1), 0.5).multiplyScalar(2), side: THREE.DoubleSide });
  const glowMat = new THREE.SpriteMaterial({ map: tex, color: hot.clone().multiplyScalar(0.8), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  trash.push(tex, nozzleGeo, coreGeo, coreMat, glowMat);
  const thrusters: THREE.Vector3[] = [];
  const glows: THREE.Sprite[] = [];
  for (const s of [-1, 1]) {
    const n = outlined(nozzleGeo.clone());
    n.rotation.x = Math.PI / 2;
    n.position.set(s * 0.3, 0.08, 0.72);
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.set(s * 0.3, 0.08, 0.93);
    root.add(core);
    const glow = new THREE.Sprite(glowMat);
    glow.position.set(s * 0.3, 0.08, 1.0);
    root.add(glow);
    glows.push(glow);
    thrusters.push(new THREE.Vector3(s * 0.3, 0.08, 0.95));
  }

  // hover glow under the hull
  const underMat = new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(pal.edge).multiplyScalar(0.3), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  trash.push(underMat);
  const under = new THREE.Sprite(underMat);
  under.position.set(0, -0.3, 0.1);
  under.scale.set(1.8, 0.7, 1);
  root.add(under);

  root.scale.setScalar(1.25);
  for (const t of thrusters) t.multiplyScalar(1.25);
  return {
    root, thrusters,
    update(time, power) {
      const f = 0.85 + 0.15 * Math.sin(time * 47) + 0.1 * Math.sin(time * 31.7);
      const s = (0.4 + 0.3 * power) * f;
      for (const g of glows) g.scale.set(s * 1.1, s * 1.1, 1);
      under.scale.set(1.7 + 0.2 * Math.sin(time * 6), 0.65, 1);
    },
    dispose() { for (const t of trash) t.dispose(); },
  };
};

export const SHIPS: Record<string, ShipFactory> = { arrowhead };
export const DEFAULT_SHIP = 'arrowhead';
