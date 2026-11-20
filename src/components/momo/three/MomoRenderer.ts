import * as THREE from "three";

/**
 * Momo — a procedurally modelled chrome cat head rendered with Three.js.
 * No external model files: everything is built from geometry so it loads
 * instantly and can be animated per-feature (lids, ears, iris, mouth).
 *
 * All motion goes through frame-rate independent damping, so it stays
 * smooth on 60 Hz, 120 Hz and slow devices alike.
 */

export const EXPRESSIONS = [
  "idle",
  "blinking",
  "happy",
  "excited",
  "curious",
  "thinking",
  "confused",
  "surprised",
  "sleeping",
  "talking",
  "listening",
] as const;
export type Expression = (typeof EXPRESSIONS)[number];

type Pose = {
  lidUp: number; // 0 open → 1 closed
  lidLow: number; // 0 open → 1 raised (smile squint)
  eyeScale: number;
  tilt: number; // head roll (rad)
  pitch: number; // head nod (rad)
  earSpread: number; // + outward
  earFold: number; // + folded back
  earAsym: number; // left/right difference (confused/curious)
  iris: string;
  glow: number;
  blush: number;
  gaze?: [number, number];
  pupil: number; // pupil width
  bob: number; // bounce impulse
  sway: number; // idle sway amount
};

const POSES: Record<Expression, Pose> = {
  idle: { lidUp: 0.12, lidLow: 0.05, eyeScale: 1, tilt: 0, pitch: 0, earSpread: 0, earFold: 0, earAsym: 0, iris: "#ffb547", glow: 1, blush: 0.15, pupil: 1, bob: 0, sway: 1 },
  blinking: { lidUp: 0.12, lidLow: 0.05, eyeScale: 1, tilt: 0, pitch: 0, earSpread: 0, earFold: 0, earAsym: 0, iris: "#ffb547", glow: 1, blush: 0.15, pupil: 1, bob: 0, sway: 1 },
  happy: { lidUp: 0.42, lidLow: 0.55, eyeScale: 1, tilt: -0.08, pitch: -0.05, earSpread: 0.05, earFold: 0.05, earAsym: 0, iris: "#ff8fb1", glow: 1.2, blush: 0.75, pupil: 1.1, bob: 0.4, sway: 1.2 },
  excited: { lidUp: 0.0, lidLow: 0.18, eyeScale: 1.1, tilt: 0, pitch: -0.08, earSpread: -0.12, earFold: -0.15, earAsym: 0, iris: "#ff6a3d", glow: 1.8, blush: 0.65, pupil: 1.35, bob: 1, sway: 1.4 },
  curious: { lidUp: 0.05, lidLow: 0.02, eyeScale: 1.08, tilt: 0.24, pitch: -0.03, earSpread: -0.05, earFold: -0.1, earAsym: 0.18, iris: "#8ea2ff", glow: 1.3, blush: 0.2, pupil: 1.25, bob: 0.2, sway: 0.8 },
  thinking: { lidUp: 0.38, lidLow: 0.1, eyeScale: 0.96, tilt: -0.16, pitch: -0.1, earSpread: 0.08, earFold: 0.05, earAsym: -0.08, iris: "#6ee7ff", glow: 1.1, blush: 0.1, gaze: [-0.7, 0.8], pupil: 0.8, bob: 0, sway: 0.5 },
  confused: { lidUp: 0.22, lidLow: 0.05, eyeScale: 1, tilt: 0.3, pitch: 0, earSpread: 0.2, earFold: 0.25, earAsym: 0.4, iris: "#ffd84d", glow: 1, blush: 0.1, gaze: [0.4, 0.2], pupil: 0.7, bob: 0, sway: 0.6 },
  surprised: { lidUp: 0, lidLow: 0, eyeScale: 1.18, tilt: 0, pitch: 0.05, earSpread: -0.2, earFold: -0.3, earAsym: 0, iris: "#ffffff", glow: 2, blush: 0.2, pupil: 0.55, bob: 1.2, sway: 0.4 },
  sleeping: { lidUp: 1, lidLow: 0.25, eyeScale: 1, tilt: -0.14, pitch: 0.16, earSpread: 0.3, earFold: 0.4, earAsym: 0, iris: "#ffb547", glow: 0, blush: 0.3, pupil: 1, bob: 0, sway: 0.35 },
  talking: { lidUp: 0.1, lidLow: 0.08, eyeScale: 1.02, tilt: 0, pitch: 0, earSpread: -0.04, earFold: -0.05, earAsym: 0, iris: "#ffb547", glow: 1.3, blush: 0.35, pupil: 1.1, bob: 0, sway: 1 },
  listening: { lidUp: 0.04, lidLow: 0.02, eyeScale: 1.06, tilt: 0.12, pitch: -0.02, earSpread: -0.22, earFold: -0.25, earAsym: 0, iris: "#5eead4", glow: 1.6, blush: 0.25, gaze: [0, 0], pupil: 1.3, bob: 0, sway: 0.6 },
};

const damp = (cur: number, target: number, lambda: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Critically-damped spring for bouncy motion (bob, ear twitch). */
class Spring {
  v = 0;
  x = 0;
  constructor(
    private k = 120,
    private c = 14,
  ) {}
  step(target: number, dt: number) {
    const a = -this.k * (this.x - target) - this.c * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
    return this.x;
  }
  kick(v: number) {
    this.v += v;
  }
}

export type RendererOptions = {
  /** Pixel size of the drawing buffer (CSS can scale it). */
  size?: number;
  dark?: boolean;
  reducedMotion?: boolean;
};

export class MomoRenderer {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  private root = new THREE.Group(); // flight lean
  private head = new THREE.Group(); // expressions
  private chrome!: THREE.MeshPhysicalMaterial;
  private earL!: THREE.Group;
  private earR!: THREE.Group;
  private eyes: {
    group: THREE.Group;
    iris: THREE.Group;
    irisMat: THREE.MeshBasicMaterial;
    pupil: THREE.Mesh;
    lidUp: THREE.Mesh;
    lidLow: THREE.Mesh;
    lash: THREE.Mesh;
    side: 1 | -1;
  }[] = [];
  private mouthOpen!: THREE.Object3D;
  private blush: THREE.MeshBasicMaterial[] = [];
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private pmrem: THREE.PMREMGenerator;

  private expression: Expression = "idle";
  private talking = false;
  private level = { current: -1 } as { current: number };
  private pointer: [number, number] = [0, 0];
  private velocity: [number, number] = [0, 0];
  private reduced: boolean;

  // animated state
  private s = {
    lidUp: 0.12,
    lidLow: 0.05,
    eyeScale: 1,
    tilt: 0,
    pitch: 0,
    yaw: 0,
    earSpread: 0,
    earFold: 0,
    earAsym: 0,
    glow: 1,
    blush: 0.15,
    gx: 0,
    gy: 0,
    pupil: 1,
    mouth: 0,
    leanX: 0,
    leanZ: 0,
  };
  private iris = new THREE.Color("#ffb547");
  private irisTarget = new THREE.Color("#ffb547");
  private blink = 0;
  private blinkTarget = 0;
  private nextBlink = 1.5;
  private bob = new Spring(140, 12);
  private twitchL = new Spring(260, 10);
  private twitchR = new Spring(260, 10);
  private nextTwitch = 3;
  private t = 0;
  private last = 0;
  private raf = 0;
  private running = false;
  private disposed = false;

  constructor(opts: RendererOptions = {}) {
    const size = opts.size ?? 512;
    this.reduced = Boolean(opts.reducedMotion);
    this.canvas = document.createElement("canvas");
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
      premultipliedAlpha: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(size, size, false);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.canvas.addEventListener("webglcontextlost", (e) => e.preventDefault());

    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.camera.position.set(0, 0.12, 6.6);
    this.camera.lookAt(0, 0.08, 0);

    this.build();
    this.setTheme(Boolean(opts.dark));
    this.root.add(this.head);
    this.scene.add(this.root);
  }

  // ---------------------------------------------------------------------
  // Model
  // ---------------------------------------------------------------------
  private build() {
    // Liquid chrome with a thin-film rainbow sheen (iridescence)
    this.chrome = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#f7f7fa"),
      metalness: 1,
      roughness: 0.05,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      iridescence: 1,
      iridescenceIOR: 1.6,
      iridescenceThicknessRange: [260, 820],
      envMapIntensity: 1.2,
    });
    const darkMetal = new THREE.MeshPhysicalMaterial({ color: "#26262c", metalness: 0.9, roughness: 0.3, clearcoat: 0.6 });
    const pinkMetal = new THREE.MeshPhysicalMaterial({ color: "#ffb6c8", metalness: 0.7, roughness: 0.2, clearcoat: 1, iridescence: 0.3 });
    const glass = new THREE.MeshPhysicalMaterial({ color: "#040408", metalness: 0, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.8 });

    // Body/head: one round puffball (the whole character is the face)
    const SX = 1.02;
    const SY = 0.96;
    const SZ = 0.98;
    const bodyGeo = new THREE.SphereGeometry(1, 96, 72);
    bodyGeo.scale(SX, SY, SZ);
    this.head.add(new THREE.Mesh(bodyGeo, this.chrome));
    /** z of the body surface at (x, y), for placing features on the skin */
    const surfZ = (x: number, y: number) => SZ * Math.sqrt(Math.max(0, 1 - (x / SX) ** 2 - (y / SY) ** 2));

    // Ears: small rounded triangles (pivot at the base so they can fold/twitch)
    const earGeo = new THREE.ConeGeometry(0.3, 0.52, 64, 1);
    earGeo.translate(0, 0.26, 0);
    const innerGeo = new THREE.ConeGeometry(0.19, 0.34, 48, 1);
    innerGeo.translate(0, 0.17, 0);
    const makeEar = (side: 1 | -1) => {
      const g = new THREE.Group();
      g.position.set(side * 0.56, 0.7, -0.02);
      const outer = new THREE.Mesh(earGeo, this.chrome);
      outer.scale.set(1, 1, 0.46);
      const inner = new THREE.Mesh(innerGeo, pinkMetal);
      inner.scale.set(1, 1, 0.32);
      inner.position.set(0, 0.05, 0.075);
      g.add(outer, inner);
      this.head.add(g);
      return g;
    };
    this.earL = makeEar(-1);
    this.earR = makeEar(1);

    // Anime cowlick ("ahoge") curl on top
    const curl = new THREE.CatmullRomCurve3(
      [
        [-0.02, 0.86, 0.36],
        [0.02, 1.08, 0.36],
        [0.16, 1.22, 0.32],
        [0.3, 1.14, 0.3],
        [0.27, 1.0, 0.33],
        [0.16, 1.02, 0.36],
        [0.14, 1.1, 0.37],
      ].map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    );
    this.head.add(new THREE.Mesh(new THREE.TubeGeometry(curl, 96, 0.04, 16), this.chrome));

    // Tiny nose
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.04, 24, 16), pinkMetal);
    nose.position.set(0, -0.22, surfZ(0, -0.22) + 0.005);
    nose.scale.set(1.4, 0.8, 0.7);
    this.head.add(nose);

    // Mouth "ω" + open mouth with a little tongue
    const ink = new THREE.MeshStandardMaterial({ color: "#121216", roughness: 0.5, metalness: 0.2 });
    const wPts = [
      [-0.11, -0.3],
      [-0.06, -0.35],
      [-0.015, -0.33],
      [0, -0.29],
      [0.015, -0.33],
      [0.06, -0.35],
      [0.11, -0.3],
    ].map(([x, y]) => new THREE.Vector3(x, y, surfZ(x, y) + 0.01));
    this.head.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wPts), 64, 0.011, 8), ink));
    const mouth = new THREE.Group();
    mouth.position.set(0, -0.42, surfZ(0, -0.42) - 0.03);
    const cavity = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 32, 16),
      new THREE.MeshPhysicalMaterial({ color: "#3a0b17", roughness: 0.35, clearcoat: 1, emissive: "#24030d" }),
    );
    cavity.scale.set(1, 1, 0.45);
    const tongue = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 24, 12),
      new THREE.MeshPhysicalMaterial({ color: "#ff6f8e", roughness: 0.3, clearcoat: 1 }),
    );
    tongue.position.set(0, -0.045, 0.025);
    tongue.scale.set(1, 0.6, 0.5);
    mouth.add(cavity, tongue);
    this.mouthOpen = mouth;
    this.mouthOpen.scale.set(1, 0.05, 1);
    this.head.add(mouth);

    // Eyes: big glossy anime eyes
    for (const side of [-1, 1] as const) {
      const ex = side * 0.34;
      const ey = -0.02;
      const group = new THREE.Group();
      group.position.set(ex, ey, surfZ(ex, ey) - 0.08);
      group.rotation.set(-0.04, side * 0.36, side * -0.06);
      group.scale.set(1, 1.16, 1);

      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.2, 48, 32), glass);
      ball.scale.z = 0.55;
      group.add(ball);

      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 12, 64), darkMetal);
      rim.position.z = 0.015;
      rim.scale.set(1, 1, 0.55);
      group.add(rim);

      const iris = new THREE.Group();
      iris.position.z = 0.112;
      const irisMat = new THREE.MeshBasicMaterial({ color: "#5a3a8a", toneMapped: false });
      const irisMesh = new THREE.Mesh(new THREE.CircleGeometry(0.125, 48), irisMat);
      const irisShade = new THREE.Mesh(
        new THREE.CircleGeometry(0.125, 48),
        new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.45 }),
      );
      irisShade.position.set(0, 0.03, 0.001);
      irisShade.scale.set(1, 0.75, 1);
      const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.07, 32), new THREE.MeshBasicMaterial({ color: "#020203" }));
      pupil.position.z = 0.002;
      pupil.scale.set(0.9, 1.15, 1);
      iris.add(irisMesh, irisShade, pupil);
      group.add(iris);

      // sparkle highlights (fixed in the socket)
      const hl = new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false });
      const h1 = new THREE.Mesh(new THREE.CircleGeometry(0.06, 24), hl);
      h1.position.set(-0.055, 0.07, 0.118);
      const h2 = new THREE.Mesh(new THREE.CircleGeometry(0.024, 16), hl);
      h2.position.set(0.06, -0.065, 0.118);
      const h3 = new THREE.Mesh(new THREE.CircleGeometry(0.012, 12), hl);
      h3.position.set(0.035, 0.085, 0.118);
      group.add(h1, h2, h3);

      // Eyelids (flattened pivot, rotating chrome caps)
      const lidGeoUp = new THREE.SphereGeometry(0.215, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2);
      const lidGeoLow = new THREE.SphereGeometry(0.213, 48, 24, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
      const lidPivot = new THREE.Group();
      lidPivot.scale.z = 0.78;
      const lidUp = new THREE.Mesh(lidGeoUp, this.chrome);
      const lidLow = new THREE.Mesh(lidGeoLow, this.chrome);
      lidPivot.add(lidUp, lidLow);
      group.add(lidPivot);
      const lash = new THREE.Mesh(
        new THREE.TorusGeometry(0.14, 0.018, 8, 40, Math.PI),
        new THREE.MeshStandardMaterial({ color: "#16161a", roughness: 0.5, transparent: true, opacity: 0 }),
      );
      lash.rotation.z = Math.PI;
      lash.position.set(0, 0.03, 0.172);
      lash.scale.set(1, 0.55, 1);
      group.add(lash);

      this.head.add(group);
      this.eyes.push({ group, iris, irisMat, pupil, lidUp, lidLow, lash, side });
    }

    // Blush glow
    for (const side of [-1, 1]) {
      const mat = new THREE.MeshBasicMaterial({
        color: "#ff6f91",
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const bx = side * 0.56;
      const by = -0.24;
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.11, 32), mat);
      m.position.set(bx, by, surfZ(bx, by) + 0.01);
      m.rotation.y = side * 0.6;
      m.scale.set(1.35, 0.62, 1);
      this.blush.push(mat);
      this.head.add(m);
    }

    // Whiskers (short, she is still a cat)
    const whiskerMat = new THREE.MeshStandardMaterial({ color: "#cfcfd8", metalness: 1, roughness: 0.25 });
    for (const side of [-1, 1]) {
      for (const [dy, ang] of [
        [0.0, 0.08],
        [-0.07, -0.06],
      ]) {
        const sx = side * 0.66;
        const sy = -0.3 + dy;
        const curve = new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(sx, sy, surfZ(sx, sy)),
          new THREE.Vector3(side * 0.92, sy + ang * 0.6, surfZ(sx, sy) - 0.12),
          new THREE.Vector3(side * 1.12, sy + ang * 1.4, surfZ(sx, sy) - 0.3),
        );
        this.head.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.006, 6), whiskerMat));
      }
    }
  }

  /** Bright studio environment with soft rainbow strips (holographic chrome). */
  setTheme(dark: boolean) {
    const env = new THREE.Scene();
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(20, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: dark ? "#b4b2ba" : "#d8d6dc", side: THREE.BackSide }),
    );
    const ground = new THREE.Mesh(
      new THREE.SphereGeometry(20, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: dark ? "#9a99a2" : "#b6b4bc", side: THREE.BackSide }),
    );
    env.add(sky, ground);
    const light = (color: string, intensity: number, w: number, h: number, pos: [number, number, number]) => {
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      m.position.set(...pos);
      m.lookAt(0, 0, 0);
      env.add(m);
    };
    light("#ffffff", 7, 14, 5, [0, 10, 3]); // top softbox
    light("#ffffff", 5, 4, 10, [-9, 2, 6]); // key
    light("#ffffff", 4, 4, 10, [9, 1, 5]); // fill
    light("#ffffff", 9, 16, 0.35, [0, 7.5, 7]); // horizontal strip (lands on the forehead, not the eyes)
    light("#ffffff", 8, 0.35, 10, [5.5, 0, 9]); // vertical strip
    light("#ff9ec7", 3.2, 10, 0.6, [0, -6, 7]); // pink band
    light("#9ee7ff", 3.2, 10, 0.6, [0, -7, 6]); // cyan band
    light("#fff1a8", 2.6, 0.6, 8, [-5.5, 0, 8.5]); // butter band
    light("#ffffff", 1.6, 14, 6, [0, -6, 8]); // front fill from below
    light("#3a3a44", 1, 18, 2.2, [0, -4.2, 9]); // soft dark band low on the body (shape definition)
    this.envTarget?.dispose();
    this.envTarget = this.pmrem.fromScene(env, 0.03);
    this.scene.environment = this.envTarget.texture;
    env.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose();
    });
    this.renderOnce();
  }

  // ---------------------------------------------------------------------
  // Controls
  // ---------------------------------------------------------------------
  setExpression(e: Expression) {
    if (e === this.expression) return;
    const prev = this.expression;
    this.expression = e;
    const pose = POSES[e];
    this.irisTarget.set(pose.iris);
    if (pose.bob && !this.reduced) this.bob.kick(pose.bob * 2.2);
    if ((e === "surprised" || e === "listening" || prev === "sleeping") && !this.reduced) {
      this.twitchL.kick(-3);
      this.twitchR.kick(-3);
    }
  }
  setTalking(talking: boolean) {
    this.talking = talking;
  }
  setLevelRef(ref: { current: number }) {
    this.level = ref;
  }
  /** Normalised pointer direction relative to Momo, each in [-1, 1]. */
  setPointer(x: number, y: number) {
    this.pointer = [clamp(x, -1, 1), clamp(y, -1, 1)];
  }
  /** Screen-space flight velocity (px/s) — Momo leans into the motion. */
  setVelocity(vx: number, vy: number) {
    this.velocity = [vx, vy];
  }
  poke() {
    if (this.reduced) return;
    this.bob.kick(2.4);
    this.twitchL.kick(-4);
    this.twitchR.kick(4);
  }

  start() {
    if (this.running || this.disposed) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.update(dt);
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
  renderOnce() {
    this.update(0.016);
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.disposed = true;
    this.stop();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.envTarget?.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
  }

  // ---------------------------------------------------------------------
  // Animation
  // ---------------------------------------------------------------------
  private update(dt: number) {
    this.t += dt;
    const pose = POSES[this.expression];
    const s = this.s;
    const r = this.reduced ? 0.25 : 1;

    // Blinking (random, sometimes double) — disabled when eyes are closed
    this.nextBlink -= dt;
    if (this.nextBlink <= 0 && pose.lidUp < 0.6) {
      this.blinkTarget = 1;
      this.nextBlink = this.expression === "blinking" ? 0.9 : 2 + Math.random() * 4;
      if (Math.random() < 0.18) this.nextBlink = 0.28;
    }
    this.blink = damp(this.blink, this.blinkTarget, 38, dt);
    if (this.blinkTarget === 1 && this.blink > 0.93) this.blinkTarget = 0;

    // Random ear twitch
    this.nextTwitch -= dt;
    if (this.nextTwitch <= 0 && !this.reduced && this.expression !== "sleeping") {
      (Math.random() < 0.5 ? this.twitchL : this.twitchR).kick(Math.random() < 0.5 ? -5 : 5);
      this.nextTwitch = 3 + Math.random() * 6;
    }

    // Talking → mouth
    let mouthTarget = 0;
    if (this.talking || this.expression === "talking") {
      const lvl = this.level.current;
      mouthTarget =
        lvl >= 0
          ? clamp(lvl, 0, 1)
          : 0.25 + 0.55 * Math.abs(Math.sin(this.t * 9.3)) * (0.55 + 0.45 * Math.sin(this.t * 3.7));
    }

    // Ease every parameter toward its pose
    const k = 7;
    s.lidUp = damp(s.lidUp, pose.lidUp, k, dt);
    s.lidLow = damp(s.lidLow, pose.lidLow, k, dt);
    s.eyeScale = damp(s.eyeScale, pose.eyeScale, 9, dt);
    s.tilt = damp(s.tilt, pose.tilt * r, 5, dt);
    s.pitch = damp(s.pitch, pose.pitch * r, 5, dt);
    s.earSpread = damp(s.earSpread, pose.earSpread, 8, dt);
    s.earFold = damp(s.earFold, pose.earFold, 8, dt);
    s.earAsym = damp(s.earAsym, pose.earAsym, 6, dt);
    s.glow = damp(s.glow, pose.glow, 6, dt);
    s.blush = damp(s.blush, pose.blush, 4, dt);
    s.pupil = damp(s.pupil, pose.pupil, 8, dt);
    s.mouth = damp(s.mouth, mouthTarget, 22, dt);
    this.iris.lerp(this.irisTarget, 1 - Math.exp(-6 * dt));

    // Gaze & head follow the pointer (or the pose's fixed gaze)
    const [px, py] = pose.gaze ?? this.pointer;
    s.gx = damp(s.gx, px, 10, dt);
    s.gy = damp(s.gy, py, 10, dt);
    s.yaw = damp(s.yaw, this.pointer[0] * 0.3 * r, 4, dt);

    // Flight lean
    const [vx, vy] = this.velocity;
    s.leanZ = damp(s.leanZ, clamp(-vx / 3200, -0.22, 0.22) * r, 6, dt);
    s.leanX = damp(s.leanX, clamp(vy / 4000, -0.16, 0.16) * r, 6, dt);

    // Idle life: layered sines (cheap pseudo-noise)
    const t = this.t;
    const sway = pose.sway * r;
    const idleY = (Math.sin(t * 0.9) * 0.6 + Math.sin(t * 2.1 + 1) * 0.25) * 0.035 * sway;
    const idleRot = (Math.sin(t * 0.7 + 2) * 0.5 + Math.sin(t * 1.6) * 0.2) * 0.05 * sway;
    const breathe = 1 + Math.sin(t * (this.expression === "sleeping" ? 1.4 : 2.2)) * 0.008 * (this.reduced ? 0.3 : 1);
    const talkNod = s.mouth * 0.05;

    const bob = this.bob.step(0, dt);
    this.root.rotation.z = s.leanZ;
    this.root.rotation.x = s.leanX;
    this.head.position.y = idleY + bob * 0.09;
    this.head.rotation.set(
      s.pitch + this.pointer[1] * 0.16 * r + talkNod + idleRot * 0.4,
      s.yaw + idleRot,
      s.tilt + idleRot * 0.6,
    );
    this.head.scale.setScalar(breathe);

    // Ears
    const twL = this.twitchL.step(0, dt);
    const twR = this.twitchR.step(0, dt);
    this.earL.rotation.set(-0.12 - s.earFold - s.earAsym * 0.3, 0.1, 0.5 + s.earSpread + s.earAsym + twL * 0.05);
    this.earR.rotation.set(-0.12 - s.earFold + s.earAsym * 0.3, -0.1, -0.5 - s.earSpread - twR * 0.05);

    // Eyes
    const confusedSquint = this.expression === "confused" ? 0.28 : 0;
    for (const e of this.eyes) {
      const up = clamp(Math.max(s.lidUp + (e.side === 1 ? confusedSquint : 0), this.blink), 0, 1);
      const low = clamp(s.lidLow, 0, 1);
      // upper lid: −1.45 (open, tipped back) → +1.62 (closed); lower lid mirrors
      e.lidUp.rotation.x = -1.45 + up * 3.07;
      e.lidLow.rotation.x = 1.45 - low * 2.3;
      const lashMat = e.lash.material as THREE.MeshStandardMaterial;
      lashMat.opacity = clamp((up - 0.8) / 0.15, 0, 1);
      e.lash.visible = lashMat.opacity > 0.01;
      e.group.scale.set(s.eyeScale, 1.16 * s.eyeScale, s.eyeScale);
      e.iris.position.x = s.gx * 0.045;
      e.iris.position.y = s.gy * -0.04;
      e.irisMat.color.copy(this.iris).multiplyScalar(0.32 + s.glow * 0.22);
      e.pupil.scale.set(0.9 * s.pupil, 1.15 * (0.85 + s.pupil * 0.15), 1);
    }

    // Mouth
    this.mouthOpen.scale.set(1 + s.mouth * 0.2, 0.05 + s.mouth * 0.95, 1);
    this.mouthOpen.visible = s.mouth > 0.03;

    for (const b of this.blush) b.opacity = s.blush * 0.55;
  }
}
