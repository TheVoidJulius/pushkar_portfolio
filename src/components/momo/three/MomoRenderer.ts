import * as THREE from "three";

/**
 * Mikuro — a procedurally modelled liquid-chrome cat rendered with Three.js.
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
  "coffee",
  "yawning",
  "stretching",
  "smug",
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
  coffee: { lidUp: 0.46, lidLow: 0.22, eyeScale: 0.98, tilt: -0.07, pitch: 0.05, earSpread: 0.1, earFold: 0.1, earAsym: 0.05, iris: "#ffb547", glow: 0.9, blush: 0.4, gaze: [0.45, 0.55], pupil: 0.95, bob: 0, sway: 0.5 },
  yawning: { lidUp: 0.84, lidLow: 0.34, eyeScale: 0.96, tilt: 0.1, pitch: -0.2, earSpread: 0.16, earFold: 0.3, earAsym: 0, iris: "#ffb547", glow: 0.6, blush: 0.3, pupil: 0.9, bob: 0, sway: 0.3 },
  stretching: { lidUp: 0.72, lidLow: 0.42, eyeScale: 1, tilt: -0.05, pitch: -0.14, earSpread: -0.16, earFold: -0.22, earAsym: 0, iris: "#ffb547", glow: 0.9, blush: 0.4, pupil: 1, bob: 0.3, sway: 0.2 },
  smug: { lidUp: 0.42, lidLow: 0.2, eyeScale: 1, tilt: 0.13, pitch: -0.04, earSpread: 0.04, earFold: 0, earAsym: 0.1, iris: "#c9a2ff", glow: 1.2, blush: 0.3, gaze: [0.7, -0.1], pupil: 0.85, bob: 0.1, sway: 0.7 },
};

/**
 * Turns the physical material into flowing liquid metal: slow-moving normal
 * ripples bend the reflections while the geometry stays put, and the ripples
 * calm down across the face so expressions always read cleanly.
 */
function makeLiquid(material: THREE.MeshPhysicalMaterial, time: { value: number }) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uLiquidTime = time;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vLiquidPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLiquidPos = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vLiquidPos;
        uniform float uLiquidTime;
        float liquidField(vec3 p) {
          float t = uLiquidTime;
          return sin(p.x * 2.7 + t * 0.55 + sin(p.y * 3.1 - t * 0.4)) * 0.5
            + sin(p.y * 3.7 - t * 0.42 + sin(p.z * 2.9 + t * 0.3)) * 0.3
            + sin(p.z * 4.3 + t * 0.36 + sin(p.x * 3.3)) * 0.2;
        }`,
      )
      .replace(
        "#include <clearcoat_normal_fragment_maps>",
        `#include <clearcoat_normal_fragment_maps>
        {
          const float e = 0.03;
          float f0 = liquidField(vLiquidPos);
          vec3 grad = vec3(
            liquidField(vLiquidPos + vec3(e, 0.0, 0.0)) - f0,
            liquidField(vLiquidPos + vec3(0.0, e, 0.0)) - f0,
            liquidField(vLiquidPos + vec3(0.0, 0.0, e)) - f0
          ) / e;
          float face = smoothstep(0.2, 0.8, vLiquidPos.z) * (1.0 - smoothstep(0.35, 0.8, abs(vLiquidPos.y + 0.08)));
          vec3 ripple = mat3(viewMatrix) * grad * 0.07 * (1.0 - 0.8 * face);
          normal = normalize(normal + ripple);
          #ifdef USE_CLEARCOAT
            clearcoatNormal = normalize(clearcoatNormal + ripple * 0.6);
          #endif
        }`,
      );
  };
  material.customProgramCacheKey = () => "mikuro-liquid-chrome";
}

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
  private envTargets: Partial<Record<"dark" | "light", THREE.WebGLRenderTarget>> = {};
  private pmrem: THREE.PMREMGenerator;
  private liquidTime = { value: 0 };
  private mug!: THREE.Group;
  private steam: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; phase: number }[] = [];
  private bufferPx = 0;
  private quality = 1;
  private displayPx = 320;
  private lastResize = 0;
  private slowFrames = 0;
  private frames = 0;
  private sinceRender = 0;
  private idleHandle = 0;

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
    mug: 0,
    yawn: 0,
    stretch: 0,
    envYaw: 0,
    envPitch: 0,
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
    // The drawing buffer follows the on-screen size (see setDisplaySize)
    this.renderer.setPixelRatio(1);
    this.displayPx = size;
    this.bufferPx = this.targetBuffer();
    this.renderer.setSize(this.bufferPx, this.bufferPx, false);
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

    // Prepare the other theme's reflections while idle, so toggling never hitches
    const prepare = () => {
      if (!this.disposed) this.envFor(!opts.dark);
    };
    this.idleHandle = window.setTimeout(() => {
      if (typeof requestIdleCallback === "function") requestIdleCallback(prepare, { timeout: 2000 });
      else prepare();
    }, 1500);
  }

  private targetBuffer() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * this.quality;
    return clamp(Math.round((this.displayPx * dpr) / 32) * 32, 128, 640);
  }

  /** Renders only as many pixels as the cat occupies on screen. */
  setDisplaySize(cssPx: number) {
    this.displayPx = cssPx;
    const now = performance.now();
    if (now - this.lastResize < 400) return;
    const target = this.targetBuffer();
    if (Math.abs(target - this.bufferPx) < 32) return;
    this.lastResize = now;
    this.bufferPx = target;
    this.renderer.setSize(target, target, false);
    this.renderer.render(this.scene, this.camera); // resizing clears the canvas
  }

  // ---------------------------------------------------------------------
  // Model
  // ---------------------------------------------------------------------
  private build() {
    // Polished liquid metal, with only a trace of thin-film colour
    this.chrome = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#eef0f4"),
      metalness: 1,
      roughness: 0.07,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      iridescence: 0.28,
      iridescenceIOR: 1.5,
      iridescenceThicknessRange: [240, 520],
      envMapIntensity: 1.25,
    });
    if (!this.reduced) makeLiquid(this.chrome, this.liquidTime);
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

    // Coffee mug (only exists on screen during a coffee break)
    this.mug = new THREE.Group();
    const cupProfile = [
      [0, 0],
      [0.13, 0],
      [0.155, 0.02],
      [0.17, 0.24],
      [0.158, 0.24],
      [0.145, 0.04],
      [0, 0.04],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const cup = new THREE.Mesh(new THREE.LatheGeometry(cupProfile, 40), pinkMetal);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.018, 10, 28, Math.PI * 1.25), this.chrome);
    handle.position.set(0.165, 0.12, 0);
    handle.rotation.z = -Math.PI * 0.62;
    const coffee = new THREE.Mesh(
      new THREE.CircleGeometry(0.15, 32),
      new THREE.MeshPhysicalMaterial({ color: "#2a1509", roughness: 0.18, clearcoat: 1 }),
    );
    coffee.rotation.x = -Math.PI / 2;
    coffee.position.y = 0.2;
    this.mug.add(cup, handle, coffee);
    const puff = new THREE.SphereGeometry(0.035, 10, 8);
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(puff, mat);
      this.mug.add(mesh);
      this.steam.push({ mesh, mat, phase: i / 3 });
    }
    this.mug.visible = false;
    this.head.add(this.mug);
  }

  /** Reflections for a theme, built once and reused. */
  private envFor(dark: boolean) {
    const id = dark ? "dark" : "light";
    const cached = this.envTargets[id];
    if (cached) return cached;
    const target = this.buildEnv(dark);
    this.envTargets[id] = target;
    return target;
  }

  setTheme(dark: boolean) {
    this.scene.environment = this.envFor(dark).texture;
    this.renderOnce();
  }

  /** Studio environment: bright softboxes and dark bands give chrome its contrast. */
  private buildEnv(dark: boolean) {
    const env = new THREE.Scene();
    env.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(20, 48, 32),
        new THREE.ShaderMaterial({
          side: THREE.BackSide,
          depthWrite: false,
          uniforms: { uDim: { value: dark ? 0.8 : 1 } },
          vertexShader: `varying vec3 vDir;
            void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
          // The face reflects what's in front (a soft, clean gradient). The dark, rippled
          // contours live behind the cat, so they only appear around its silhouette.
          fragmentShader: `varying vec3 vDir; uniform float uDim;
            float band(float x, float c, float w) { return 1.0 - smoothstep(0.0, w, abs(x - c)); }
            void main() {
              vec3 d = normalize(vDir);
              float az = atan(d.x, d.z);
              float h = d.y + 0.045 * sin(az * 3.0 + 0.6) + 0.02 * sin(az * 7.0 + 1.7);
              vec3 c = mix(vec3(0.86, 0.87, 0.92), vec3(0.42, 0.46, 0.57), smoothstep(-0.55, 0.6, h));
              c = mix(c, vec3(1.55, 1.57, 1.62), smoothstep(0.66, 0.94, h));
              c = mix(c, vec3(0.5, 0.49, 0.54), 1.0 - smoothstep(-0.95, -0.6, h));
              float z = d.z + 0.09 * sin(d.y * 6.0 + az * 2.0) + 0.04 * sin(d.y * 13.0 - az * 3.0);
              c = mix(c, vec3(0.035, 0.038, 0.055), (1.0 - smoothstep(-0.62, -0.2, z)) * 0.96);
              c += vec3(1.0, 0.55, 0.75) * 0.34 * band(z, -0.2, 0.05);
              c += vec3(0.45, 0.82, 1.0) * 0.34 * band(z, -0.29, 0.05);
              c = mix(c, vec3(1.25, 1.27, 1.34), 1.0 - smoothstep(-0.99, -0.86, z));
              float upright = smoothstep(-0.25, 0.05, d.y) * (1.0 - smoothstep(0.55, 0.85, d.y));
              c += vec3(2.6) * band(az, -1.5, 0.11) * upright;
              c += vec3(1.7) * band(az, 1.72, 0.07) * upright;
              c -= vec3(0.3) * band(az, 2.5, 0.28) * upright;
              gl_FragColor = vec4(max(c, vec3(0.0)) * uDim, 1.0);
            }`,
        }),
      ),
    );
    const target = this.pmrem.fromScene(env, 0.03);
    env.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose();
    });
    return target;
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
      this.raf = requestAnimationFrame(loop);
      const elapsed = (now - this.last) / 1000;
      this.last = now;
      this.sinceRender += elapsed;
      // Small and calm in the corner? 30 fps is indistinguishable and halves GPU use
      const calm = this.displayPx < 130 && !this.talking && Math.abs(this.velocity[0]) + Math.abs(this.velocity[1]) < 20;
      if (calm && this.sinceRender < 1 / 31) return;
      const dt = Math.min(0.05, this.sinceRender);
      this.sinceRender = 0;
      this.update(dt);
      this.renderer.render(this.scene, this.camera);
      this.watchPerformance(elapsed, calm);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** Lowers resolution if this device is struggling. Never raises it mid-session. */
  private watchPerformance(elapsed: number, calm: boolean) {
    if (calm || elapsed > 0.25) return; // throttled frames and tab switches don't count
    this.frames++;
    if (elapsed > 0.024) this.slowFrames++;
    if (this.frames < 120) return;
    if (this.slowFrames / this.frames > 0.4 && this.quality > 0.6) {
      this.quality = Math.max(0.6, this.quality - 0.2);
      this.lastResize = 0;
      this.setDisplaySize(this.displayPx);
    }
    this.frames = 0;
    this.slowFrames = 0;
  }
  renderOnce() {
    this.update(0.016);
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.idleHandle);
    this.stop();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.envTargets.dark?.dispose();
    this.envTargets.light?.dispose();
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

    // Character business: yawn, stretch, coffee
    const acting = this.expression;
    s.yawn = damp(s.yawn, acting === "yawning" ? 1 : 0, acting === "yawning" ? 3.2 : 7, dt);
    s.stretch = damp(s.stretch, acting === "stretching" ? 1 : 0, 3.4, dt);
    s.mug = damp(s.mug, acting === "coffee" ? 1 : 0, 6, dt);
    mouthTarget = Math.max(mouthTarget, s.yawn);
    // A sip every few seconds: the mug rises, tips, and the eyes close
    const sipWave = 0.5 + 0.5 * Math.sin(this.t * 1.5 - 1.2);
    const sip = acting === "coffee" && !this.reduced ? clamp((sipWave - 0.62) / 0.26, 0, 1) : 0;
    const sipEase = sip * sip * (3 - 2 * sip);

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
    // Squash and stretch keeps the volume roughly constant, like a soft body
    const pull = s.stretch * (0.075 + Math.sin(t * 3) * 0.012) * r + s.yawn * 0.025 * r;
    this.head.scale.set(breathe * (1 - pull * 0.7), breathe * (1 + pull), breathe * (1 - pull * 0.35));

    // Reflections drift slowly and respond to the cursor: the highlights feel alive
    this.liquidTime.value = t;
    s.envYaw = damp(s.envYaw, this.pointer[0] * 0.55 * r, 2.4, dt);
    s.envPitch = damp(s.envPitch, this.pointer[1] * 0.22 * r, 2.4, dt);
    this.scene.environmentRotation.set(s.envPitch, s.envYaw + (this.reduced ? 0 : Math.sin(t * 0.13) * 0.5), 0);

    // Mug
    this.mug.visible = s.mug > 0.015;
    if (this.mug.visible) {
      this.mug.scale.setScalar(s.mug * 0.92);
      this.mug.position.set(0.68 - sipEase * 0.56, -0.72 + sipEase * 0.2, 0.72 + sipEase * 0.32);
      this.mug.rotation.set(sipEase * 0.32, -0.3, sipEase * 0.62);
      for (const p of this.steam) {
        const f = (t * 0.42 + p.phase) % 1;
        p.mesh.position.set(Math.sin(f * 7 + p.phase * 6) * 0.045, 0.27 + f * 0.36, 0);
        p.mesh.scale.setScalar(0.7 + f * 1.5);
        p.mat.opacity = Math.sin(f * Math.PI) * 0.26 * (1 - sipEase);
      }
    }

    // Ears
    const twL = this.twitchL.step(0, dt);
    const twR = this.twitchR.step(0, dt);
    this.earL.rotation.set(-0.12 - s.earFold - s.earAsym * 0.3, 0.1, 0.5 + s.earSpread + s.earAsym + twL * 0.05);
    this.earR.rotation.set(-0.12 - s.earFold + s.earAsym * 0.3, -0.1, -0.5 - s.earSpread - twR * 0.05);

    // Eyes
    const confusedSquint = this.expression === "confused" ? 0.28 : 0;
    for (const e of this.eyes) {
      const up = clamp(Math.max(s.lidUp + (e.side === 1 ? confusedSquint : 0), this.blink, sipEase * 0.94), 0, 1);
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
    this.mouthOpen.scale.set(1 + s.mouth * 0.2 + s.yawn * 0.3, 0.05 + s.mouth * 0.95 + s.yawn * 0.75, 1);
    this.mouthOpen.visible = s.mouth > 0.03;

    for (const b of this.blush) b.opacity = s.blush * 0.55;
  }
}
