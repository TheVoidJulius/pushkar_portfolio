import * as THREE from "three";
import type { FestivalId } from "@/lib/festivals";

/**
 * Festival dressing for the igloo scene. SnowScene creates this lazily (only
 * while a festival is on) and calls update() once per frame from its own loop,
 * so it pauses offscreen with the scene. Everything here is additive: a handful
 * of sprites, one instanced mesh and at most a few small Points objects.
 */

export interface FestiveHost {
  scene: THREE.Scene;
  radial: THREE.Texture;
  height: (x: number, z: number) => number;
  reduced: boolean;
  mobile: boolean;
}

const R = 2.3; // igloo radius
const H = 2.45; // igloo height
const DOOR = 0.42; // tunnel yaw
const TAU = Math.PI * 2;

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
/** Dome radius at height y (ellipsoid), so lights hug the snow blocks. */
const domeR = (y: number) => R * Math.sqrt(Math.max(0.02, 1 - (y / H) ** 2));
const awayFromDoor = (th: number) => Math.abs(th - DOOR) > 0.42;

export interface Festive {
  update(dt: number): void;
  dispose(): void;
}

export function createFestive(id: FestivalId, host: FestiveHost): Festive | null {
  switch (id) {
    case "diwali":
      return new Diyas(host, "diwali");
    case "navratri":
      return new Diyas(host, "navratri");
    case "holi":
      return new Holi(host);
    case "december":
      return new Decembers(host);
    case "newyear":
      return new Fireworks(host);
    case "republic":
    case "independence":
      return new Bunting(host);
    default:
      return null;
  }
}

/* ───────────────────────────── shared helpers ───────────────────────────── */

class Base {
  readonly group = new THREE.Group();
  protected t = 0;
  constructor(protected host: FestiveHost) {
    host.scene.add(this.group);
  }
  protected glow(color: string, opacity: number, w: number, h = w) {
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.host.radial, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity }),
    );
    s.scale.set(w, h, 1);
    this.group.add(s);
    return s;
  }
  dispose() {
    this.host.scene.remove(this.group);
    this.group.traverse((o) => {
      const m = o as THREE.Mesh | THREE.Points;
      m.geometry?.dispose();
      const mat = (m as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) x.dispose();
    });
  }
}

/** Particle bursts (fireworks in the sky, colour powder at ground level). */
class Bursts {
  private slots: { pts: THREE.Points; vel: Float32Array; age: number; life: number; on: boolean }[] = [];
  constructor(
    private group: THREE.Group,
    host: FestiveHost,
    count: number,
    private per: number,
    private additive: boolean,
    size: number,
  ) {
    for (let i = 0; i < count; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(per * 3), 3));
      geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(per * 3), 3));
      const mat = new THREE.PointsMaterial({
        map: host.radial,
        size,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        toneMapped: false,
        opacity: 0,
        sizeAttenuation: true,
      });
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      pts.visible = false;
      this.group.add(pts);
      this.slots.push({ pts, vel: new Float32Array(per * 3), age: 0, life: 1, on: false });
    }
  }
  launch(origin: THREE.Vector3, palette: string[], speed: [number, number], life: number, lift: number) {
    const s = this.slots.find((x) => !x.on);
    if (!s) return false;
    const pos = s.pts.geometry.getAttribute("position") as THREE.BufferAttribute;
    const col = s.pts.geometry.getAttribute("color") as THREE.BufferAttribute;
    const c1 = new THREE.Color(pick(palette));
    const c2 = new THREE.Color(pick(palette));
    for (let i = 0; i < this.per; i++) {
      pos.setXYZ(i, origin.x, origin.y, origin.z);
      const u = rnd(-1, 1);
      const a = rnd(0, TAU);
      const r = Math.sqrt(1 - u * u);
      const sp = rnd(speed[0], speed[1]);
      s.vel[i * 3] = Math.cos(a) * r * sp;
      s.vel[i * 3 + 1] = u * sp + lift;
      s.vel[i * 3 + 2] = Math.sin(a) * r * sp;
      const c = Math.random() < 0.6 ? c1 : c2;
      col.setXYZ(i, c.r, c.g, c.b);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    s.age = 0;
    s.life = life;
    s.on = true;
    s.pts.visible = true;
    return true;
  }
  step(dt: number, gravity: number, drag: number) {
    for (const s of this.slots) {
      if (!s.on) continue;
      s.age += dt;
      if (s.age >= s.life) {
        s.on = false;
        s.pts.visible = false;
        continue;
      }
      const pos = s.pts.geometry.getAttribute("position") as THREE.BufferAttribute;
      const k = Math.exp(-drag * dt);
      for (let i = 0; i < this.per; i++) {
        s.vel[i * 3] *= k;
        s.vel[i * 3 + 1] = s.vel[i * 3 + 1] * k - gravity * dt;
        s.vel[i * 3 + 2] *= k;
        pos.setXYZ(i, pos.getX(i) + s.vel[i * 3] * dt, pos.getY(i) + s.vel[i * 3 + 1] * dt, pos.getZ(i) + s.vel[i * 3 + 2] * dt);
      }
      pos.needsUpdate = true;
      const f = s.age / s.life;
      (s.pts.material as THREE.PointsMaterial).opacity = Math.min(1, f * 12) * (1 - f) * (this.additive ? 1 : 0.9);
    }
  }
}

/* ───────────────────────── Diwali and Navratri ───────────────────────── */

class Diyas extends Base implements Festive {
  private flames: { s: THREE.Sprite; halo: THREE.Sprite; ph: number }[] = [];
  private lanterns: { s: THREE.Sprite; x: number; z: number; y: number; sp: number; ph: number }[] = [];
  private pool: THREE.Sprite;

  constructor(host: FestiveHost, kind: "diwali" | "navratri") {
    super(host);
    const marigold = ["#ffb43a", "#ff7a1a", "#ffd23f", "#e8344e"];
    const spots: THREE.Vector3[] = [];
    const ring = (radius: number, n: number, from: number, to: number) => {
      for (let i = 0; i < n; i++) {
        const th = from + ((to - from) * i) / Math.max(1, n - 1) + rnd(-0.03, 0.03);
        if (!awayFromDoor(th)) continue;
        const x = Math.sin(th) * radius;
        const z = Math.cos(th) * radius;
        spots.push(new THREE.Vector3(x, host.height(x, z) + 0.05, z));
      }
    };
    ring(3.15, host.mobile ? 11 : 15, -1.7, 1.9);
    ring(4.7, host.mobile ? 6 : 9, -1.5, 1.7);

    const body = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.13, 10, 6, 0, TAU, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: "#8f4326", toneMapped: false }),
      spots.length,
    );
    const m = new THREE.Matrix4();
    spots.forEach((p, i) => {
      body.setMatrixAt(i, m.compose(p, new THREE.Quaternion(), new THREE.Vector3(1, 0.62, 1)));
      const tint = kind === "navratri" ? pick(marigold) : "#ffb347";
      const halo = this.glow(tint, 0.42, 0.95, 0.7);
      halo.position.set(p.x, p.y + 0.12, p.z);
      const s = this.glow("#fff0b8", 0.95, 0.2, 0.3);
      s.position.set(p.x, p.y + 0.17, p.z);
      this.flames.push({ s, halo, ph: rnd(0, TAU) });
    });
    body.instanceMatrix.needsUpdate = true;
    this.group.add(body);

    // a warmer wash of light on the snow around the whole house
    this.pool = this.glow(kind === "navratri" ? "#ff8a3a" : "#ffa94a", 0.22, 15, 6.5);
    this.pool.position.set(0.4, 0.5, 1.8);

    if (kind === "diwali") {
      const n = host.mobile ? 4 : 7;
      for (let i = 0; i < n; i++) {
        const s = this.glow("#ff9a3c", 0.7, 0.42, 0.55);
        this.lanterns.push({ s, x: rnd(-6.5, 6.5), z: rnd(-6, -2), y: rnd(2, 11), sp: rnd(0.14, 0.26), ph: rnd(0, TAU) });
      }
    }
    this.place(0);
  }

  private place(t: number) {
    for (const f of this.flames) {
      const k = this.host.reduced ? 1 : 0.86 + 0.14 * Math.sin(t * 7 + f.ph) * Math.sin(t * 3.1 + f.ph * 2);
      (f.s.material as THREE.SpriteMaterial).opacity = 0.95 * k;
      (f.halo.material as THREE.SpriteMaterial).opacity = 0.42 * k;
    }
    for (const l of this.lanterns) {
      const y = this.host.reduced ? l.y : 2 + ((l.y - 2 + t * l.sp * 3) % 9.5);
      l.s.position.set(l.x + Math.sin(t * 0.3 + l.ph) * 0.3, y, l.z);
      (l.s.material as THREE.SpriteMaterial).opacity = 0.7 * Math.min(1, (11.5 - y) / 2.5);
    }
  }

  update(dt: number) {
    if (this.host.reduced) return;
    this.t += dt;
    this.place(this.t);
  }
}

/* ─────────────────────────────── Holi ─────────────────────────────── */

const HOLI = ["#ff4fa3", "#35c2ff", "#ffe14d", "#7bd94a", "#b86bff", "#ff7a2a"];

class Holi extends Base implements Festive {
  private bursts: Bursts;
  private splats: THREE.Mesh[] = [];
  private next = 0.6;
  private nextSplat = 0;
  private pending: { at: number; p: THREE.Vector3; c: string }[] = [];

  constructor(host: FestiveHost) {
    super(host);
    this.bursts = new Bursts(this.group, host, host.mobile ? 3 : 5, host.mobile ? 36 : 60, false, 0.3);
    const n = host.mobile ? 6 : 9;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(
        new THREE.CircleGeometry(1, 20),
        new THREE.MeshBasicMaterial({ map: host.radial, color: "#fff", transparent: true, depthWrite: false, opacity: 0, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 }),
      );
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 3;
      this.group.add(m);
      this.splats.push(m);
    }
    // the powder that has already landed (this is all reduced-motion sees)
    for (let i = 0; i < n; i++) this.splat(HOLI[i % HOLI.length], this.spot(), 0.8);
  }

  private spot() {
    const a = rnd(-1.4, 1.5);
    const r = rnd(3.1, 6.2);
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    return new THREE.Vector3(x, this.host.height(x, z), z);
  }

  private splat(color: string, p: THREE.Vector3, opacity: number) {
    const m = this.splats[this.nextSplat++ % this.splats.length];
    m.position.set(p.x, p.y + 0.06, p.z);
    m.scale.setScalar(rnd(0.7, 1.3));
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.color.set(color);
    mat.opacity = opacity;
  }

  update(dt: number) {
    if (this.host.reduced) return;
    this.t += dt;
    if (this.t > this.next) {
      this.next = this.t + rnd(1.1, 2.1);
      const p = this.spot();
      const c = pick(HOLI);
      p.y += 0.6;
      if (this.bursts.launch(p, [c, pick(HOLI)], [1.1, 2.6], 3.2, 1.5)) this.pending.push({ at: this.t + 1.5, p: this.spot(), c });
    }
    this.pending = this.pending.filter((q) => {
      if (this.t < q.at) return true;
      this.splat(q.c, q.p, 0.8);
      return false;
    });
    this.bursts.step(dt, 1.3, 1.6);
  }
}

/* ────────────────────────── December: snow + lights ────────────────────────── */

class Decembers extends Base implements Festive {
  private bulbs: { s: THREE.Sprite; ph: number }[] = [];
  private flakes?: THREE.Points;
  private wind = 0;

  constructor(host: FestiveHost) {
    super(host);
    const colors = ["#ff5a5a", "#ffd166", "#6ee7a0", "#7cc4ff"];
    const n = host.mobile ? 20 : 30;
    for (let i = 0; i < n; i++) {
      const th = -1.75 + (3.9 * i) / (n - 1);
      if (!awayFromDoor(th)) continue;
      const y = 1.05 + 0.5 * Math.cos(th * 2.4) + 0.12 * Math.sin(i * 1.7);
      const r = domeR(y) + 0.22;
      const s = this.glow(colors[i % colors.length], 0.95, 0.26);
      s.position.set(Math.sin(th) * r, y, Math.cos(th) * r);
      this.bulbs.push({ s, ph: rnd(0, TAU) });
    }
    const count = host.mobile ? 500 : 1300;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = rnd(-10, 10);
      pos[i * 3 + 1] = rnd(0, 11);
      pos[i * 3 + 2] = rnd(-9, 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.flakes = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ map: host.radial, color: "#ffffff", size: 0.1, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }),
    );
    this.flakes.frustumCulled = false;
    this.group.add(this.flakes);
    this.twinkle(0);
  }

  private twinkle(t: number) {
    for (const b of this.bulbs) (b.s.material as THREE.SpriteMaterial).opacity = this.host.reduced ? 0.9 : 0.55 + 0.45 * Math.sin(t * 2.2 + b.ph) ** 2;
  }

  update(dt: number) {
    if (this.host.reduced || !this.flakes) return;
    this.t += dt;
    this.twinkle(this.t);
    this.wind = Math.sin(this.t * 0.2) * 0.5;
    const a = this.flakes.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < a.count; i++) {
      let y = a.getY(i) - dt * (0.7 + (i % 7) * 0.09);
      let x = a.getX(i) + dt * (this.wind + Math.sin(this.t * 0.7 + i) * 0.12);
      if (y < 0) {
        y = 11;
        x = rnd(-10, 10);
      }
      a.setXYZ(i, x, y, a.getZ(i));
    }
    a.needsUpdate = true;
  }
}

/* ───────────────────────────── New Year ───────────────────────────── */

class Fireworks extends Base implements Festive {
  private bursts: Bursts;
  private next = 0.4;
  // Saturated colours that still read against the pale sky (no white)
  private palette = ["#ffb000", "#ff3d7f", "#2f8cff", "#19c37d", "#a64dff"];

  constructor(host: FestiveHost) {
    super(host);
    // Normal blending: the igloo sky is pale, so additive sparks wash out to nothing
    this.bursts = new Bursts(this.group, host, host.mobile ? 2 : 4, host.mobile ? 44 : 72, false, 0.32);
    if (host.reduced) {
      // one frozen burst, so there is still something festive to look at
      this.bursts.launch(new THREE.Vector3(-2.4, 5.6, -7), this.palette, [2, 3.4], 5, 0);
      this.bursts.launch(new THREE.Vector3(3.6, 6.4, -8), this.palette, [1.6, 2.8], 5, 0);
      this.bursts.step(1.2, 0.5, 1.4);
    }
  }

  update(dt: number) {
    if (this.host.reduced) return;
    this.t += dt;
    if (this.t > this.next) {
      this.next = this.t + rnd(1.3, 2.8);
      this.bursts.launch(new THREE.Vector3(rnd(-6, 6), rnd(4.6, 7.4), rnd(-10, -5)), this.palette, [1.8, 3.6], 2.6, 0.2);
    }
    this.bursts.step(dt, 0.9, 1.5);
  }
}

/* ───────────── Republic / Independence Day: quiet tricolour bunting ───────────── */

class Bunting extends Base implements Festive {
  private flags: THREE.InstancedMesh;
  private items: { th: number; y: number; r: number; ph: number }[] = [];

  constructor(host: FestiveHost) {
    super(host);
    const tri = new THREE.Shape();
    tri.moveTo(-0.11, 0);
    tri.lineTo(0.11, 0);
    tri.lineTo(0, -0.26);
    const colors = ["#ff9933", "#f6f6f2", "#138808"];
    const n = host.mobile ? 15 : 21;
    this.flags = new THREE.InstancedMesh(new THREE.ShapeGeometry(tri), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), n);
    for (let i = 0; i < n; i++) {
      const th = -1.75 + (3.9 * i) / (n - 1);
      const y = 1.7 + 0.42 * Math.cos(th * 2.1) - 0.1;
      this.items.push({ th, y, r: domeR(y) + 0.32, ph: rnd(0, TAU) });
      this.flags.setColorAt(i, new THREE.Color(colors[i % 3]));
    }
    this.group.add(this.flags);
    this.place(0);
  }

  private place(t: number) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    this.items.forEach((it, i) => {
      if (!awayFromDoor(it.th)) one.setScalar(0.0001);
      else one.setScalar(1);
      p.set(Math.sin(it.th) * it.r, it.y, Math.cos(it.th) * it.r);
      e.set(0.3 + (this.host.reduced ? 0 : Math.sin(t * 1.6 + it.ph) * 0.08), it.th, 0);
      q.setFromEuler(e);
      this.flags.setMatrixAt(i, m.compose(p, q, one));
    });
    this.flags.instanceMatrix.needsUpdate = true;
  }

  update(dt: number) {
    if (this.host.reduced) return;
    this.t += dt;
    this.place(this.t);
  }
}
