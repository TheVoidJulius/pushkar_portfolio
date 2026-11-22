import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { SnowScene } from "./SnowScene";
import type { SnowMark } from "./useSnowMarks";

/**
 * The guestbook in the snow: every visitor's mark (paw print, footprints, a
 * tiny snowman or a snow angel) lives in Mikuro's snowfield. One InstancedMesh
 * per kind, rebuilt only when the list changes; the only per-frame work is the
 * short "pop in" of brand-new marks, and it runs from onBeforeRender, so
 * nothing happens while the scene is paused off screen.
 */

type Host = ReturnType<SnowScene["layerHost"]>;

const CAP = 200;
// The patch of snow (world units) that x/z 0..1 map onto: in front of and around the igloo
const X0 = -6;
const X1 = 6;
const Z0 = -2.2;
const Z1 = 5.4;
const POP = 0.6; // seconds

const toWorldX = (x: number) => X0 + x * (X1 - X0);
const toWorldZ = (z: number) => Z0 + z * (Z1 - Z0);

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
};

/** A flat ellipse lying on the snow. `lift` stacks overlapping pieces so the print never double-darkens. */
const disc = (rx: number, rz: number, cx: number, cz: number, rot = 0, lift = 0) => {
  const g = new THREE.CircleGeometry(1, 18);
  g.rotateX(-Math.PI / 2);
  g.scale(rx, 1, rz);
  g.rotateY(rot);
  g.translate(cx, lift, cz);
  return g;
};

const stack = (parts: [number, number, number, number, number?][]) =>
  parts.map(([rx, rz, cx, cz, rot], i) => disc(rx, rz, cx, cz, rot ?? 0, (parts.length - i) * 0.003));

const paw = (ox: number, oz: number) =>
  [
    [0.085, 0.072, ox, oz],
    [0.034, 0.038, ox - 0.075, oz - 0.095],
    [0.034, 0.038, ox, oz - 0.125],
    [0.034, 0.038, ox + 0.075, oz - 0.095],
  ] as [number, number, number, number][];

function printGeometry(kind: number) {
  let parts: [number, number, number, number, number?][];
  if (kind === 0) parts = [...paw(-0.11, 0.16), ...paw(0.11, -0.16)];
  else if (kind === 1)
    parts = [
      [0.07, 0.12, -0.1, 0.02],
      [0.058, 0.06, -0.1, 0.2],
      [0.07, 0.12, 0.1, -0.16],
      [0.058, 0.06, 0.1, 0.02],
    ];
  else
    parts = [
      [0.16, 0.3, 0, 0.04],
      [0.11, 0.11, 0, -0.36],
      [0.38, 0.12, -0.24, -0.12, 0.45],
      [0.38, 0.12, 0.24, -0.12, -0.45],
      [0.24, 0.22, 0, 0.36],
    ];
  const pieces = stack(parts);
  const g = mergeGeometries(pieces)!;
  for (const p of pieces) p.dispose();
  return g;
}

function snowmanGeometry() {
  const tint = (g: THREE.BufferGeometry, hex: string) => {
    const c = new THREE.Color(hex);
    const n = g.getAttribute("position").count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(a, 3));
    return g;
  };
  const ball = (r: number, y: number) => tint(new THREE.SphereGeometry(r, 14, 10).translate(0, y, 0), "#f4f7fb");
  const nose = new THREE.ConeGeometry(0.018, 0.07, 8);
  nose.rotateX(Math.PI / 2);
  nose.translate(0, 0.39, 0.085);
  const eye = (x: number) => tint(new THREE.SphereGeometry(0.011, 6, 4).translate(x, 0.41, 0.052), "#23262d");
  const pieces = [ball(0.12, 0.08), ball(0.085, 0.24), ball(0.062, 0.37), tint(nose, "#ff8a3d"), eye(-0.022), eye(0.022)];
  const g = mergeGeometries(pieces.map((p) => p.toNonIndexed()))!;
  for (const p of pieces) p.dispose();
  return g;
}

type Pop = { kind: number; i: number; born: number; m: THREE.Matrix4 };

export class SnowMarks {
  private host: Host;
  private reduced: boolean;
  private meshes: THREE.InstancedMesh[] = [];
  private printMat: THREE.MeshBasicMaterial;
  private snowmanMat: THREE.MeshStandardMaterial;
  private known = new Set<string>();
  private pops: Pop[] = [];
  private world = new Float32Array(CAP * 2);
  private placed = 0;
  private primed = false;
  private lastFrame = -1;
  private lastLook: unknown = null;
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private n = new THREE.Vector3();
  private s = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);

  constructor(scene: SnowScene, reduced: boolean) {
    this.host = scene.layerHost();
    this.reduced = reduced;
    this.printMat = new THREE.MeshBasicMaterial({
      color: "#7c8596",
      transparent: true,
      opacity: 0.4,
      depthFunc: THREE.LessDepth,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.snowmanMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    const tick = (r: THREE.WebGLRenderer) => this.tick(r);
    for (let k = 0; k < 4; k++) {
      const geo = k === 2 ? snowmanGeometry() : printGeometry(k);
      const mesh = new THREE.InstancedMesh(geo, k === 2 ? this.snowmanMat : this.printMat, CAP);
      mesh.count = 0;
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.castShadow = k === 2;
      mesh.receiveShadow = k === 2;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.onBeforeRender = tick;
      this.host.scene.add(mesh);
      this.meshes.push(mesh);
    }
  }

  /** Is this world spot open snow (not the dome, the tunnel or the doorway)? */
  private free(wx: number, wz: number) {
    const { mouth, R } = this.host;
    if (Math.hypot(wx, wz) < R + 0.45) return false;
    if (Math.hypot(wx - mouth.x, wz - mouth.z) < 2.0) return false;
    // the walk from the dome out through the door
    const len2 = mouth.x * mouth.x + mouth.z * mouth.z;
    const t = Math.min(1.35, Math.max(0, (wx * mouth.x + wz * mouth.z) / len2));
    return Math.hypot(wx - mouth.x * t, wz - mouth.z * t) > 1.3;
  }

  /** Raycast a canvas point (NDC, -1..1) onto the snow. Returns 0..1 coordinates, or null if it's not a free spot. */
  pick(ndcX: number, ndcY: number): { x: number; z: number } | null {
    this.ray.setFromCamera(this.ndc.set(ndcX, ndcY), this.host.camera);
    const { origin, direction } = this.ray.ray;
    const h = this.host.height;
    let prev = 0;
    for (let t = 0.5; t < 60; t += 0.12) {
      const x = origin.x + direction.x * t;
      const z = origin.z + direction.z * t;
      if (origin.y + direction.y * t <= h(x, z)) {
        let a = prev;
        let b = t;
        for (let i = 0; i < 12; i++) {
          const m = (a + b) / 2;
          if (origin.y + direction.y * m <= h(origin.x + direction.x * m, origin.z + direction.z * m)) b = m;
          else a = m;
        }
        const wx = origin.x + direction.x * b;
        const wz = origin.z + direction.z * b;
        const nx = (wx - X0) / (X1 - X0);
        const nz = (wz - Z0) / (Z1 - Z0);
        if (nx < 0 || nx > 1 || nz < 0 || nz > 1 || !this.free(wx, wz)) return null;
        return { x: nx, z: nz };
      }
      prev = t;
    }
    return null;
  }

  /** A random free spot that's on screen and not on top of another mark. */
  randomSpot(): { x: number; z: number } | null {
    const cam = this.host.camera;
    let fallback: { x: number; z: number } | null = null;
    for (let tries = 0; tries < 80; tries++) {
      const x = 0.05 + Math.random() * 0.9;
      const z = 0.05 + Math.random() * 0.9;
      const wx = toWorldX(x);
      const wz = toWorldZ(z);
      if (!this.free(wx, wz)) continue;
      const p = this.v.set(wx, this.host.height(wx, wz), wz).project(cam);
      if (Math.abs(p.x) > 0.8 || p.y < -0.7 || p.y > 0.3 || p.z > 1) continue;
      fallback ??= { x, z };
      let near = false;
      for (let i = 0; i < this.placed && !near; i++) near = Math.hypot(this.world[i * 2] - wx, this.world[i * 2 + 1] - wz) < 0.65;
      if (!near) return { x, z };
    }
    return fallback;
  }

  /** Sync with the latest marks (newest first). Marks not seen before pop in when `animate` is on. */
  set(marks: readonly SnowMark[], animate: boolean) {
    // the first full load just appears; only marks after that pop in
    const pop = animate && this.primed && !this.reduced;
    if (animate) this.primed = true;
    const counts = [0, 0, 0, 0];
    const now = performance.now();
    const h = this.host.height;
    const seen = new Set<string>();
    this.pops.length = 0;
    this.placed = 0;
    for (const mk of marks) {
      if (this.placed >= CAP) break;
      const k = mk.kind;
      const mesh = this.meshes[k];
      if (!mesh) continue;
      seen.add(mk.id);
      const wx = toWorldX(mk.x);
      const wz = toWorldZ(mk.z);
      const y = h(wx, wz);
      this.world[this.placed * 2] = wx;
      this.world[this.placed * 2 + 1] = wz;
      this.placed++;
      // lie on the slope (prints) or stand upright (snowman), turned a random way
      const e = 0.15;
      this.n.set(h(wx - e, wz) - h(wx + e, wz), 2 * e, h(wx, wz - e) - h(wx, wz + e)).normalize();
      if (k === 2) this.n.lerp(this.up, 0.75).normalize();
      this.q.setFromUnitVectors(this.up, this.n);
      this.q2.setFromAxisAngle(this.up, hash(mk.id) * Math.PI * 2);
      this.q.multiply(this.q2);
      const scale = k === 2 ? 0.9 : k === 3 ? 1 : 1.1;
      this.v.set(wx, y + (k === 2 ? -0.02 : 0.02), wz);
      const i = counts[k]++;
      if (pop && !this.known.has(mk.id)) {
        this.pops.push({ kind: k, i, born: now, m: new THREE.Matrix4().compose(this.v, this.q, this.s.setScalar(scale)) });
        this.m4.makeScale(0, 0, 0);
      } else this.m4.compose(this.v, this.q, this.s.setScalar(scale));
      mesh.setMatrixAt(i, this.m4);
    }
    this.known = seen;
    for (let k = 0; k < 4; k++) {
      const mesh = this.meshes[k]!;
      mesh.count = counts[k]!;
      mesh.visible = mesh.count > 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** Once per rendered frame (only while the scene is on screen and drawing marks). */
  private tick(r: THREE.WebGLRenderer) {
    const frame = r.info.render.frame;
    if (frame === this.lastFrame) return;
    this.lastFrame = frame;
    const look = this.host.look();
    if (look !== this.lastLook) {
      this.lastLook = look;
      this.printMat.color.set(look.paw);
      this.printMat.opacity = Math.min(0.7, look.pawOpacity + 0.12);
    }
    if (!this.pops.length) return;
    const now = performance.now();
    for (let j = this.pops.length - 1; j >= 0; j--) {
      const p = this.pops[j]!;
      const t = Math.min(1, (now - p.born) / 1000 / POP);
      // ease-out-back: a little overshoot, like snow being pressed then settling
      const c = 1.9;
      const s = 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
      p.m.decompose(this.v, this.q, this.s);
      this.s.multiplyScalar(Math.max(0, s));
      this.m4.compose(this.v, this.q, this.s);
      const mesh = this.meshes[p.kind]!;
      mesh.setMatrixAt(p.i, this.m4);
      mesh.instanceMatrix.needsUpdate = true;
      if (t >= 1) {
        mesh.setMatrixAt(p.i, p.m);
        this.pops.splice(j, 1);
      }
    }
  }

  dispose() {
    for (const m of this.meshes) {
      this.host.scene.remove(m);
      m.geometry.dispose();
      m.dispose();
    }
    this.meshes = [];
    this.printMat.dispose();
    this.snowmanMat.dispose();
  }
}
