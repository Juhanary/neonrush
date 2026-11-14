import * as THREE from 'three';
import type { Palette } from './palette';
import { rng } from './track';

const SKY_FRAG = /* glsl */ `
uniform vec3 uTop, uHorizon, uBottom, uGlow, uPlanetA, uPlanetB;
uniform float uTime, uBeat;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uTop, smoothstep(0.0, 0.62, h));
  col = mix(col, uBottom, smoothstep(0.03, -0.5, h));
  col += uGlow * exp(-abs(h) * 9.0) * (0.30 + 0.18 * uBeat);

  float az = atan(d.x, -d.z);
  float beams = pow(0.5 + 0.5 * sin(az * 14.0 + uTime * 0.25), 10.0)
              + 0.6 * pow(0.5 + 0.5 * sin(az * 23.0 - uTime * 0.17 + 1.3), 14.0);
  col += uGlow * beams * 0.15 * smoothstep(-0.05, 0.1, h) * smoothstep(0.8, 0.1, h) * (0.7 + 0.5 * uBeat);

  // drifting triangle mosaic
  vec2 g = vec2(az * 7.0, h * 10.0 - uTime * 0.06);
  vec2 gi = floor(g), gf = fract(g);
  float tri = step(gf.x, gf.y);
  float tw = hash(gi + tri * 17.0);
  float blink = smoothstep(0.7, 1.0, sin(uTime * (0.6 + tw * 1.6) + tw * 40.0));
  float up = smoothstep(0.03, 0.3, h);
  col += mix(uGlow, uHorizon, 0.4) * blink * 0.12 * up;
  float line = min(min(gf.x, gf.y), abs(gf.x - gf.y));
  col += uGlow * smoothstep(0.035, 0.0, line) * 0.05 * up;

  // stars
  vec2 sg = vec2(az * 42.0, h * 42.0);
  float st = hash(floor(sg));
  col += vec3(1.0) * step(0.985, st) * smoothstep(0.14, 0.0, length(fract(sg) - 0.5))
       * (0.5 + 0.5 * sin(uTime * 3.0 + st * 100.0)) * smoothstep(0.1, 0.4, h);

  // striped planet with a ring
  vec3 pd = normalize(vec3(-0.44, 0.30, -1.0));
  float ca = dot(d, pd);
  float ang = acos(clamp(ca, -1.0, 1.0));
  float R = 0.21;
  float disc = smoothstep(R, R - 0.004, ang);
  float py = (d.y - pd.y) / R;
  float cut = py < 0.15 ? step(0.32, fract(py * 6.0 - uTime * 0.12)) : 1.0;
  vec3 pc = mix(uPlanetB, uPlanetA, smoothstep(-1.0, 0.9, py));
  col = mix(col, pc, disc * cut);
  col += uPlanetA * exp(-max(ang - R, 0.0) * 8.0) * 0.30 * (0.8 + 0.35 * uBeat);
  vec3 rel = d - pd * ca;
  float rx = dot(rel, normalize(vec3(1.0, 0.28, 0.0)));
  float ry = dot(rel, normalize(vec3(-0.28, 1.0, 0.0)));
  float rr = length(vec2(rx, ry * 3.6));
  float ringm = smoothstep(0.012, 0.0, abs(rr - R * 1.7)) + 0.5 * smoothstep(0.008, 0.0, abs(rr - R * 2.0));
  float hidden = (ry > 0.0 && ang < R) ? 0.0 : 1.0;
  col += uGlow * ringm * hidden * 0.9;

  gl_FragColor = vec4(col, 1.0);
}`;

/** Sky dome, floating wireframe shapes and drifting motes. Purely decorative. */
export class Background {
  readonly group = new THREE.Group();
  private sky: THREE.Mesh;
  private skyU: Record<string, THREE.IUniform>;
  private shapes: { o: THREE.LineSegments; ax: THREE.Vector3; s: number; y: number; ph: number }[] = [];
  private motes: THREE.Points;
  private moteU: Record<string, THREE.IUniform>;
  private trash: { dispose(): void }[] = [];

  constructor(pal: Palette, lengthZ: number) {
    const col = (h: number) => ({ value: new THREE.Color(h) });
    this.skyU = {
      uTime: { value: 0 }, uBeat: { value: 0 },
      uTop: col(pal.top), uHorizon: col(pal.horizon), uBottom: col(pal.bottom), uGlow: col(pal.glow),
      uPlanetA: col(pal.planetA), uPlanetB: col(pal.planetB),
    };
    const skyGeo = new THREE.SphereGeometry(450, 32, 20);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, depthTest: false, uniforms: this.skyU,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: SKY_FRAG,
    });
    this.sky = new THREE.Mesh(skyGeo, skyMat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.group.add(this.sky);
    this.trash.push(skyGeo, skyMat);

    // floating shapes beside the road
    const rand = rng(1337 + pal.edge);
    const geos = [
      new THREE.IcosahedronGeometry(1), new THREE.BoxGeometry(1.4, 1.4, 1.4), new THREE.OctahedronGeometry(1.1),
      new THREE.TetrahedronGeometry(1.3), new THREE.TorusGeometry(1, 0.35, 4, 6),
    ].map((g) => { const e = new THREE.EdgesGeometry(g); g.dispose(); return e; });
    const mats = [pal.edge, pal.glow, pal.accent].map((c) => new THREE.LineBasicMaterial({ color: new THREE.Color(c).multiplyScalar(0.9) }));
    this.trash.push(...geos, ...mats);
    for (let z = 10; z < lengthZ + 160; z += 9) {
      const side = rand() < 0.5 ? -1 : 1;
      const o = new THREE.LineSegments(geos[Math.floor(rand() * geos.length)], mats[Math.floor(rand() * mats.length)]);
      const y = -7 + rand() * 26;
      o.position.set(side * (15 + rand() * 30), y, -(z + rand() * 6));
      o.scale.setScalar(1.2 + rand() * 3.4);
      this.shapes.push({ o, ax: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(), s: 0.3 + rand() * 0.9, y, ph: rand() * 6.28 });
      this.group.add(o);
    }

    // motes
    const n = 420;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < p.length; i++) p[i] = Math.random();
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(p, 3));
    this.moteU = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uScale: { value: 600 }, uCol: { value: new THREE.Color(pal.glow).lerp(new THREE.Color(1, 1, 1), 0.3) } };
    const mm = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: this.moteU,
      vertexShader: /* glsl */ `
        uniform vec3 uCam; uniform float uTime, uScale; varying float vA;
        void main() {
          vec3 box = vec3(70.0, 34.0, 150.0);
          vec3 p = position * box;
          p.y += uTime * (0.6 + position.x * 1.2);
          p = mod(p - uCam, box) - box * vec3(0.5, 0.4, 0.92) + uCam;
          vA = 0.5 + 0.5 * sin(uTime * 2.5 + position.z * 90.0);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_PointSize = (0.10 + position.y * 0.16) * uScale / max(-mv.z, 1.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: 'uniform vec3 uCol; varying float vA; void main(){ float r = length(gl_PointCoord - 0.5); gl_FragColor = vec4(uCol * smoothstep(0.5, 0.0, r) * (0.35 + 0.9 * vA), 1.0); }',
    });
    this.motes = new THREE.Points(mg, mm);
    this.motes.frustumCulled = false;
    this.group.add(this.motes);
    this.trash.push(mg, mm);
  }

  setScale(px: number): void { this.moteU.uScale.value = px; }

  update(dt: number, time: number, beat: number, cam: THREE.Vector3): void {
    this.skyU.uTime.value = time; this.skyU.uBeat.value = beat;
    this.sky.position.copy(cam);
    this.moteU.uTime.value = time;
    (this.moteU.uCam.value as THREE.Vector3).copy(cam);
    for (const s of this.shapes) {
      const dz = cam.z - s.o.position.z;
      if (dz < -12 || dz > 230) { s.o.visible = false; continue; }
      s.o.visible = true;
      s.o.rotateOnAxis(s.ax, s.s * dt * (1 + beat * 1.5));
      s.o.position.y = s.y + Math.sin(time * 0.7 + s.ph) * 1.2;
    }
  }

  dispose(): void { for (const t of this.trash) t.dispose(); }
}
