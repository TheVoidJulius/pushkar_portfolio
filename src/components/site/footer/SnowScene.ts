import * as THREE from "three";

/**
 * The footer's snowy night: a little neon cyber-house where Mikuro sleeps,
 * falling snow, pine trees and paw prints. Everything is built from
 * geometry and canvas textures, so there is nothing to download.
 *
 * The React side drives the story (door, knocks, sleeping); this class only
 * animates it and reports where things are on screen so Mikuro, who lives in
 * her own canvas, can fly to the door.
 */

export type ScreenSpot = { x: number; y: number; s: number };
export type SceneSpots = Record<"path" | "door" | "inside" | "out", ScreenSpot> & {
  doorRect: { x: number; y: number; w: number; h: number };
};

const damp = (cur: number, target: number, lambda: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

class Spring {
  x = 0;
  v = 0;
  constructor(
    public k: number,
    public c: number,
  ) {}
  step(target: number, dt: number) {
    // Sub-steps keep stiff springs stable on slow frames
    const n = Math.ceil(dt / (1 / 240));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (-this.k * (this.x - target) - this.c * this.v) * h;
      this.x += this.v * h;
    }
    return this.x;
  }
}

type Palette = {
  fog: string;
  snow: string;
  hemiSky: string;
  hemiGround: string;
  hemi: number;
  key: string;
  keyI: number;
  body: string;
  bodyDark: string;
  pine: string;
  flake: string;
  flakeOpacity: number;
  path: string;
  paw: string;
  pawOpacity: number;
  moon: string;
  moonOpacity: number;
};

const PALETTES: Record<"dark" | "light", Palette> = {
  dark: {
    fog: "#151b38",
    snow: "#c6d3f3",
    hemiSky: "#7b8fd6",
    hemiGround: "#161a30",
    hemi: 0.9,
    key: "#b9c8ff",
    keyI: 1.15,
    body: "#1d2133",
    bodyDark: "#121522",
    pine: "#17322f",
    flake: "#eaf0ff",
    flakeOpacity: 0.95,
    path: "#7f93d6",
    paw: "#2b3566",
    pawOpacity: 0.55,
    moon: "#dfe6ff",
    moonOpacity: 0.95,
  },
  light: {
    fog: "#e7e0ee",
    snow: "#ffffff",
    hemiSky: "#ffffff",
    hemiGround: "#b9bdd6",
    hemi: 1.25,
    key: "#fff1e6",
    keyI: 1.7,
    body: "#2a2e44",
    bodyDark: "#1c1f30",
    pine: "#2d5550",
    flake: "#ffffff",
    flakeOpacity: 0.9,
    path: "#a9b4dd",
    paw: "#9aa6d6",
    pawOpacity: 0.5,
    moon: "#ffd9e6",
    moonOpacity: 0.55,
  },
};

const NEON_PINK = "#ff4f9a";
const NEON_CYAN = "#4ff0ff";

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const glowTexture = () =>
  canvasTexture(128, 128, (g) => {
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, "rgba(255,255,255,1)");
    r.addColorStop(0.25, "rgba(255,255,255,0.45)");
    r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
  });

const SNOW_VERT = /* glsl */ `
uniform float uTime;
uniform float uGust;
uniform vec3 uGustOrigin;
uniform float uPixel;
attribute vec3 aRand;
varying float vAlpha;
void main() {
  vec3 p = position;
  float fall = 0.35 + aRand.x * 0.55;
  p.y = mod(p.y - uTime * fall, 12.0);
  p.x += sin(uTime * 0.55 + aRand.y * 6.2831) * 0.35 + uTime * 0.18;
  p.x = mod(p.x + 15.0, 30.0) - 15.0;
  p.z += cos(uTime * 0.45 + aRand.y * 4.0) * 0.25;
  // The door bursting open blows the snow away
  vec3 d = p - uGustOrigin;
  float dist = length(d);
  p += normalize(d + 1e-4) * uGust * 3.2 * exp(-dist * 0.32);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = 0.035 + aRand.z * 0.055;
  gl_PointSize = min(size * uPixel / -mv.z, 26.0);
  vAlpha = smoothstep(0.0, 0.6, p.y) * smoothstep(12.0, 10.5, p.y) * smoothstep(0.6, 2.5, -mv.z);
}`;

const SNOW_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.12, d) * vAlpha * uOpacity;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
}`;

type Paw = { mesh: THREE.Group; mat: THREE.MeshBasicMaterial };

export class SnowScene {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(34, 1, 0.1, 120);
  private house = new THREE.Group();
  private doorPivot = new THREE.Group();
  private palette: Palette;
  private reduced: boolean;
  private w = 1;
  private h = 1;
  private raf = 0;
  private running = false;
  private disposed = false;
  private last = 0;
  private t = 0;

  // story state
  private doorOpen = false;
  private door = new Spring(38, 9);
  private rattle = new Spring(900, 16);
  private squash = new Spring(260, 11);
  private camShake = 0;
  private gust = 0;
  private sleeping = false;
  private sleepAmt = 0;
  private eyesOn = false;
  private eyesAmt = 0;
  private pawTarget = 0;
  private pawAmt = 0;
  private pawFade = 1;
  private pointer: [number, number] = [0, 0];
  private cam = { x: 0, y: 0 };

  // pieces that change with the theme or the story
  private mats: {
    snow: THREE.MeshStandardMaterial;
    body: THREE.MeshStandardMaterial;
    bodyDark: THREE.MeshStandardMaterial;
    pine: THREE.MeshStandardMaterial;
    path: THREE.MeshBasicMaterial;
    window: THREE.MeshBasicMaterial;
    porthole: THREE.MeshBasicMaterial;
    interior: THREE.MeshBasicMaterial;
    doorSign: THREE.MeshBasicMaterial;
    neonSign: THREE.MeshBasicMaterial;
    beacon: THREE.MeshBasicMaterial;
  };
  private hemi: THREE.HemisphereLight;
  private key: THREE.DirectionalLight;
  private porchLight: THREE.PointLight;
  private snowMat: THREE.ShaderMaterial;
  private moon: THREE.Sprite;
  private stars: THREE.Points;
  private glows: { sprite: THREE.Sprite; base: number; flicker?: boolean }[] = [];
  private zzz: { sprite: THREE.Sprite; phase: number }[] = [];
  private smoke: { sprite: THREE.Sprite; phase: number }[] = [];
  private bulbs: { mat: THREE.MeshBasicMaterial; phase: number }[] = [];
  private paws: Paw[] = [];
  private eyes: THREE.Group;
  private v = new THREE.Vector3();

  /** Called after each rendered frame with fresh screen positions. */
  onFrame: ((spots: SceneSpots) => void) | null = null;

  constructor(opts: { dark: boolean; reduced: boolean; mobile: boolean }) {
    this.reduced = opts.reduced;
    this.palette = PALETTES[opts.dark ? "dark" : "light"];
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.mobile ? 1.25 : 1.5));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.canvas = this.renderer.domElement;

    const p = this.palette;
    this.scene.fog = new THREE.Fog(p.fog, 11, 42);
    this.hemi = new THREE.HemisphereLight(p.hemiSky, p.hemiGround, p.hemi);
    this.key = new THREE.DirectionalLight(p.key, p.keyI);
    this.key.position.set(-6, 9, 6);
    this.porchLight = new THREE.PointLight("#ff9fc6", 6, 7, 1.6);
    this.porchLight.position.set(0, 1.6, 2.3);
    const cyanLight = new THREE.PointLight(NEON_CYAN, 3, 6, 1.8);
    cyanLight.position.set(1.6, 1.1, 2.1);
    this.scene.add(this.hemi, this.key, this.porchLight, cyanLight);

    this.mats = {
      snow: new THREE.MeshStandardMaterial({ color: p.snow, roughness: 0.92, metalness: 0 }),
      body: new THREE.MeshStandardMaterial({ color: p.body, roughness: 0.42, metalness: 0.55 }),
      bodyDark: new THREE.MeshStandardMaterial({ color: p.bodyDark, roughness: 0.5, metalness: 0.5 }),
      pine: new THREE.MeshStandardMaterial({ color: p.pine, roughness: 0.85, flatShading: true }),
      path: new THREE.MeshBasicMaterial({ color: p.path, transparent: true, opacity: 0.22, depthWrite: false }),
      window: new THREE.MeshBasicMaterial({ map: this.windowTexture(), toneMapped: false }),
      porthole: new THREE.MeshBasicMaterial({ map: this.portholeTexture(), toneMapped: false }),
      interior: new THREE.MeshBasicMaterial({ color: "#ffb36b", toneMapped: false }),
      doorSign: new THREE.MeshBasicMaterial({ map: this.doorSignTexture(), transparent: true, toneMapped: false }),
      neonSign: new THREE.MeshBasicMaterial({ map: this.neonSignTexture(), transparent: true, toneMapped: false, depthWrite: false }),
      beacon: new THREE.MeshBasicMaterial({ color: "#ff3b4f", toneMapped: false }),
    };

    this.buildGround();
    this.buildHouse();
    this.buildTrees();
    this.buildPaws();
    this.eyes = this.buildEyes();
    this.snowMat = this.buildSnow(opts.mobile ? 900 : 2000);
    this.moon = this.buildMoon();
    this.stars = this.buildStars();
    this.applyTheme();
  }

  // -------------------------------------------------------------------
  // Building
  // -------------------------------------------------------------------
  private buildGround() {
    const geo = new THREE.PlaneGeometry(130, 70, 150, 80);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i) - 14;
      pos.setZ(i, z);
      // Soft dunes, flattened around the house and along the path
      const dunes = Math.sin(x * 0.32 + z * 0.12) * 0.28 + Math.sin(x * 0.11 - z * 0.27 + 1.3) * 0.45 + Math.sin(x * 0.7 + z * 0.5) * 0.05;
      const nearHouse = clamp((Math.hypot(x, z * 1.3) - 3.2) / 4, 0, 1);
      const onPath = clamp((Math.abs(x + Math.max(0, z - 2) * 0.35) - 0.8) / 1.6, 0, 1);
      const far = clamp((-z - 8) / 20, 0, 1) * 1.6; // gentle hills in the distance
      pos.setY(i, (dunes + far) * nearHouse * (z > 1.2 ? onPath : 1) - 0.02);
    }
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, this.mats.snow);
    this.scene.add(ground);

    // Trodden path to the door
    const path = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 8), this.mats.path);
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, 0.015, 5.2);
    this.scene.add(path);
  }

  private glow(color: string, x: number, y: number, z: number, sx: number, sy: number, opacity: number, parent: THREE.Object3D, flicker = false) {
    const mat = new THREE.SpriteMaterial({
      map: this.glowMap,
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const s = new THREE.Sprite(mat);
    s.position.set(x, y, z);
    s.scale.set(sx, sy, 1);
    parent.add(s);
    this.glows.push({ sprite: s, base: opacity, flicker });
    return s;
  }
  private glowMap = glowTexture();

  private neonBar(color: string, w: number, h: number, d: number, x: number, y: number, z: number, parent: THREE.Object3D, rotZ = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
    m.position.set(x, y, z);
    m.rotation.z = rotZ;
    parent.add(m);
    return m;
  }

  private buildHouse() {
    const H = this.house;
    const m = this.mats;
    const W = 3.4;
    const D = 2.6;
    const BH = 2.1;
    const front = D / 2;

    const body = new THREE.Mesh(new THREE.BoxGeometry(W, BH, D), m.body);
    body.position.y = BH / 2;
    H.add(body);
    // panel seams
    for (const x of [-0.95, 0.95]) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.03, BH - 0.1, 0.02), m.bodyDark);
      seam.position.set(x * 1.62, BH / 2, front + 0.005);
      H.add(seam);
    }
    // neon base strip
    this.neonBar(NEON_PINK, W + 0.04, 0.035, 0.02, 0, 0.16, front + 0.012, H);
    this.neonBar(NEON_CYAN, 0.035, BH, 0.035, -W / 2, BH / 2, front, H);
    this.neonBar(NEON_CYAN, 0.035, BH, 0.035, W / 2, BH / 2, front, H);

    // gable wall
    const gable = new THREE.Shape();
    gable.moveTo(-W / 2, 0);
    gable.lineTo(W / 2, 0);
    gable.lineTo(0, 1.0);
    gable.closePath();
    const gableGeo = new THREE.ExtrudeGeometry(gable, { depth: D, bevelEnabled: false });
    const gableMesh = new THREE.Mesh(gableGeo, m.body);
    gableMesh.position.set(0, BH, -front);
    H.add(gableMesh);

    // roof slabs with snow on top
    const half = 1.92;
    const rise = 1.06;
    const ang = Math.atan2(rise, half);
    const len = Math.hypot(half, rise) + 0.08;
    for (const side of [-1, 1]) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(len, 0.12, D + 0.36), m.bodyDark);
      slab.position.set((side * half) / 2, BH + rise / 2 + 0.02, 0);
      slab.rotation.z = -side * ang;
      H.add(slab);
      const snow = new THREE.Mesh(new THREE.BoxGeometry(len + 0.02, 0.16, D + 0.4), m.snow);
      const n = new THREE.Vector2(side * Math.sin(ang), Math.cos(ang));
      snow.position.set(slab.position.x + n.x * 0.13, slab.position.y + n.y * 0.13, 0);
      snow.rotation.z = slab.rotation.z;
      H.add(snow);
      // neon roof edge
      this.neonBar(NEON_PINK, len, 0.035, 0.035, slab.position.x - n.x * 0.07, slab.position.y - n.y * 0.07, front + 0.19, H, slab.rotation.z);
      // icicles along the eave
      for (let i = 0; i < 7; i++) {
        const f = 0.1 + i * 0.13;
        const ic = new THREE.Mesh(
          new THREE.ConeGeometry(0.028, 0.12 + ((i * 37) % 5) * 0.035, 6),
          new THREE.MeshStandardMaterial({ color: "#dff4ff", roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.85 }),
        );
        ic.rotation.x = Math.PI;
        ic.position.set(side * (half - f * half * 0.95), BH + 0.02 + (1 - (half - f * half * 0.95) / half) * rise - 0.1, front + 0.17);
        H.add(ic);
      }
    }
    // snow lump on the ridge
    const ridge = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, D + 0.2, 4, 10), m.snow);
    ridge.rotation.x = Math.PI / 2;
    ridge.position.set(0, BH + rise + 0.12, 0);
    H.add(ridge);

    // porthole in the gable (the zzz float out of it)
    const port = new THREE.Mesh(new THREE.CircleGeometry(0.26, 40), m.porthole);
    port.position.set(0, BH + 0.42, front + 0.005);
    H.add(port);
    const portRim = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.025, 8, 48), new THREE.MeshBasicMaterial({ color: NEON_CYAN, toneMapped: false }));
    portRim.position.copy(port.position);
    H.add(portRim);
    this.glow(NEON_CYAN, 0, BH + 0.42, front + 0.05, 1.3, 1.3, 0.35, H);

    // door, hinged on the left
    const DW = 0.9;
    const DH = 1.42;
    const interior = new THREE.Mesh(new THREE.PlaneGeometry(DW - 0.02, DH - 0.02), m.interior);
    interior.position.set(0, DH / 2, front - 0.01);
    H.add(interior);
    this.doorPivot.position.set(-DW / 2, 0, front + 0.01);
    const door = new THREE.Mesh(new THREE.BoxGeometry(DW, DH, 0.07), m.bodyDark);
    door.position.set(DW / 2, DH / 2, 0.035);
    this.doorPivot.add(door);
    this.neonBar(NEON_CYAN, 0.03, DH * 0.7, 0.02, DW * 0.82, DH * 0.5, 0.075, this.doorPivot);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.3), m.doorSign);
    sign.position.set(DW / 2 - 0.04, DH * 0.68, 0.073);
    sign.rotation.z = -0.05;
    this.doorPivot.add(sign);
    const knocker = new THREE.Mesh(
      new THREE.TorusGeometry(0.07, 0.016, 10, 28),
      new THREE.MeshStandardMaterial({ color: "#e6e9f5", metalness: 1, roughness: 0.18 }),
    );
    knocker.position.set(DW / 2, DH * 0.44, 0.09);
    this.doorPivot.add(knocker);
    H.add(this.doorPivot);
    // frame
    this.neonBar(NEON_PINK, 0.04, DH + 0.04, 0.04, -DW / 2 - 0.03, DH / 2, front + 0.02, H);
    this.neonBar(NEON_PINK, 0.04, DH + 0.04, 0.04, DW / 2 + 0.03, DH / 2, front + 0.02, H);
    this.neonBar(NEON_PINK, DW + 0.1, 0.04, 0.04, 0, DH + 0.03, front + 0.02, H);
    this.glow(NEON_PINK, 0, DH / 2, front + 0.08, 2.0, 2.4, 0.22, H);

    // neon name sign above the door
    const neon = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.375), m.neonSign);
    neon.position.set(0, DH + 0.3, front + 0.02);
    H.add(neon);
    this.glow(NEON_PINK, 0, DH + 0.3, front + 0.1, 2.6, 0.9, 0.42, H, true);

    // windows
    for (const side of [-1, 1]) {
      const x = side * 1.12;
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.58), m.window);
      win.position.set(x, 1.22, front + 0.006);
      H.add(win);
      this.neonBar(NEON_CYAN, 0.78, 0.03, 0.03, x, 1.52, front + 0.02, H);
      this.neonBar(NEON_CYAN, 0.78, 0.03, 0.03, x, 0.92, front + 0.02, H);
      // snow on the sill
      const sill = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.66, 4, 8), m.snow);
      sill.rotation.z = Math.PI / 2;
      sill.position.set(x, 0.89, front + 0.06);
      H.add(sill);
      this.glow(NEON_CYAN, x, 1.22, front + 0.12, 1.5, 1.2, 0.3, H);
    }

    // chimney with smoke
    const chim = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.8, 0.34), m.bodyDark);
    chim.position.set(-1.0, BH + 0.78, -0.45);
    H.add(chim);
    const chimSnow = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.09, 0.42), m.snow);
    chimSnow.position.set(-1.0, BH + 1.22, -0.45);
    H.add(chimSnow);
    const smokeMap = this.glowMap;
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeMap, color: "#c9cfe6", transparent: true, opacity: 0, depthWrite: false }));
      s.position.set(-1.0, BH + 1.3, -0.45);
      H.add(s);
      this.smoke.push({ sprite: s, phase: i / 5 });
    }

    // antenna with a blinking beacon
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.9, 8), m.bodyDark);
    mast.position.set(1.05, BH + 0.95, -0.2);
    H.add(mast);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), m.beacon);
    beacon.position.set(1.05, BH + 1.42, -0.2);
    H.add(beacon);
    this.glow("#ff3b4f", 1.05, BH + 1.42, -0.15, 0.6, 0.6, 0.6, H, true);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.6), m.body);
    dish.rotation.set(-1.0, 0, 0.5);
    dish.position.set(1.05, BH + 1.1, -0.1);
    H.add(dish);

    // snow drifts against the walls
    for (const [x, z, sx] of [
      [-1.5, front + 0.1, 0.9],
      [1.45, front + 0.12, 1.0],
      [-W / 2 - 0.1, 0.3, 0.7],
      [W / 2 + 0.1, -0.2, 0.8],
    ]) {
      const drift = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10), m.snow);
      drift.scale.set(sx, 0.24, 0.42);
      drift.position.set(x, 0, z);
      H.add(drift);
    }

    // zzz
    const zTex = canvasTexture(128, 128, (g) => {
      g.font = "700 96px ui-rounded, 'Segoe UI', system-ui, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.shadowColor = NEON_CYAN;
      g.shadowBlur = 18;
      g.fillStyle = "#e9fbff";
      g.fillText("z", 64, 70);
    });
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: zTex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
      H.add(s);
      this.zzz.push({ sprite: s, phase: i / 3 });
    }

    // lamp post
    const lamp = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 2.0, 8), m.bodyDark);
    pole.position.y = 1.0;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.22), new THREE.MeshBasicMaterial({ color: NEON_CYAN, toneMapped: false }));
    head.position.y = 2.05;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.3), m.snow);
    cap.position.y = 2.15;
    lamp.add(pole, head, cap);
    lamp.position.set(2.5, 0, 2.9);
    this.scene.add(lamp);
    this.glow(NEON_CYAN, 2.5, 2.05, 2.95, 1.6, 1.6, 0.45, this.scene);

    H.rotation.y = -0.16;
    this.scene.add(H);
  }

  private pine(x: number, z: number, h: number, lights = false) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07 * h, 0.1 * h, 0.35 * h, 6), this.mats.bodyDark);
    trunk.position.y = 0.17 * h;
    g.add(trunk);
    const tiers = 3;
    for (let i = 0; i < tiers; i++) {
      const r = (0.55 - i * 0.13) * h;
      const th = (0.5 - i * 0.06) * h;
      const y = 0.3 * h + i * 0.24 * h;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, th, 7), this.mats.pine);
      cone.position.y = y + th / 2;
      cone.rotation.y = i * 0.6;
      g.add(cone);
      const snow = new THREE.Mesh(new THREE.ConeGeometry(r * 0.62, th * 0.5, 7), this.mats.snow);
      snow.position.y = y + th * 0.78;
      snow.rotation.y = i * 0.6;
      g.add(snow);
    }
    if (lights) {
      const colors = [NEON_PINK, NEON_CYAN, "#ffd36b", "#a99cff"];
      for (let i = 0; i < 14; i++) {
        const f = i / 14;
        const a = f * Math.PI * 5.2;
        const y = 0.38 * h + f * 0.75 * h;
        const r = (0.5 - f * 0.4) * h;
        const mat = new THREE.MeshBasicMaterial({ color: colors[i % 4], toneMapped: false, transparent: true });
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), mat);
        b.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
        g.add(b);
        this.bulbs.push({ mat, phase: i * 0.7 });
      }
    }
    g.position.set(x, 0, z);
    this.scene.add(g);
  }

  private buildTrees() {
    this.pine(-4.0, -0.6, 2.7, true);
    this.pine(-5.5, -3.2, 3.3);
    this.pine(4.3, -1.3, 2.4);
    this.pine(5.9, -3.8, 3.5);
    this.pine(-8.2, -8, 3.9);
    this.pine(8.8, -9, 4.1);
    this.pine(-2.6, -7.2, 3.0);
    this.pine(2.9, -8.6, 3.2);
    this.pine(11.5, -15, 4.8);
    this.pine(-12, -15.5, 5.2);
    this.pine(-6.8, 3.2, 1.6);
    this.pine(7.2, 2.4, 1.9);
  }

  private buildPaws() {
    // A curving trail from the left edge of the scene to the door
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-5.2, 0, 6.2), new THREE.Vector3(-1.6, 0, 4.2), new THREE.Vector3(0.05, 0, 1.75));
    const N = 11;
    const pad = new THREE.CircleGeometry(0.075, 16);
    const toe = new THREE.CircleGeometry(0.032, 10);
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const p = curve.getPoint(t);
      const tan = curve.getTangent(t);
      const side = i % 2 ? 1 : -1;
      const mat = new THREE.MeshBasicMaterial({ color: this.palette.paw, transparent: true, opacity: 0, depthWrite: false });
      const g = new THREE.Group();
      const padM = new THREE.Mesh(pad, mat);
      padM.scale.set(1, 0.85, 1);
      g.add(padM);
      for (const [tx, ty] of [
        [-0.07, 0.085],
        [0, 0.115],
        [0.07, 0.085],
      ]) {
        const tm = new THREE.Mesh(toe, mat);
        tm.position.set(tx, ty, 0);
        g.add(tm);
      }
      g.rotation.x = -Math.PI / 2;
      g.rotation.z = Math.atan2(-tan.x, -tan.z);
      g.position.set(p.x + tan.z * 0.12 * side, 0.03, p.z - tan.x * 0.12 * side);
      this.scene.add(g);
      this.paws.push({ mesh: g, mat });
    }
  }

  /** Two angry glowing eyes in the dark doorway (used when Mikuro is turned off). */
  private buildEyes() {
    const g = new THREE.Group();
    for (const x of [-0.13, 0.13]) {
      const e = new THREE.Mesh(new THREE.CircleGeometry(0.06, 20), new THREE.MeshBasicMaterial({ color: "#ff3b30", toneMapped: false, transparent: true }));
      e.scale.y = 0.55;
      e.rotation.z = x > 0 ? 0.35 : -0.35;
      e.position.set(x, 0, 0);
      g.add(e);
    }
    g.position.set(0, 0.95, 1.28);
    g.visible = false;
    this.house.add(g);
    return g;
  }

  private buildSnow(count: number) {
    const pos = new Float32Array(count * 3);
    const rnd = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = Math.random() * 30 - 15;
      pos[i * 3 + 1] = Math.random() * 12;
      pos[i * 3 + 2] = Math.random() * 22 - 13;
      rnd[i * 3] = Math.random();
      rnd[i * 3 + 1] = Math.random();
      rnd[i * 3 + 2] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aRand", new THREE.BufferAttribute(rnd, 3));
    const mat = new THREE.ShaderMaterial({
      vertexShader: SNOW_VERT,
      fragmentShader: SNOW_FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uGust: { value: 0 },
        uGustOrigin: { value: new THREE.Vector3(0, 0.8, 1.6) },
        uPixel: { value: 600 },
        uColor: { value: new THREE.Color(this.palette.flake) },
        uOpacity: { value: this.palette.flakeOpacity },
      },
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
    return mat;
  }

  private buildMoon() {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.moonTexture(), transparent: true, fog: false, depthWrite: false }));
    s.position.set(-11, 10.5, -40);
    s.scale.set(7, 7, 1);
    this.scene.add(s);
    return s;
  }

  private buildStars() {
    const n = 260;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = Math.random() * 120 - 60;
      pos[i * 3 + 1] = 5 + Math.random() * 24;
      pos[i * 3 + 2] = -45 - Math.random() * 10;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: "#dfe6ff", size: 0.16, transparent: true, opacity: 0.8, fog: false, depthWrite: false }));
    this.scene.add(pts);
    return pts;
  }

  // -------------------------------------------------------------------
  // Textures
  // -------------------------------------------------------------------
  private windowTexture() {
    return canvasTexture(256, 208, (g) => {
      const gr = g.createLinearGradient(0, 0, 0, 208);
      gr.addColorStop(0, "#ffd9a3");
      gr.addColorStop(1, "#ff9bc4");
      g.fillStyle = gr;
      g.fillRect(0, 0, 256, 208);
      // a cosy lamp and a cushion silhouette
      g.fillStyle = "rgba(80,30,70,0.35)";
      g.beginPath();
      g.ellipse(170, 182, 70, 24, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.5)";
      g.beginPath();
      g.arc(70, 60, 22, 0, Math.PI * 2);
      g.fill();
      // scanlines + mullions
      g.fillStyle = "rgba(40,20,60,0.08)";
      for (let y = 0; y < 208; y += 6) g.fillRect(0, y, 256, 2);
      g.fillStyle = "rgba(30,33,51,0.95)";
      g.fillRect(124, 0, 8, 208);
      g.fillRect(0, 100, 256, 8);
    });
  }

  private portholeTexture() {
    return canvasTexture(128, 128, (g) => {
      const r = g.createRadialGradient(64, 64, 4, 64, 64, 64);
      r.addColorStop(0, "#c7f6ff");
      r.addColorStop(1, "#4b6bd6");
      g.fillStyle = r;
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = "rgba(255,255,255,0.75)";
      g.beginPath();
      g.arc(78, 50, 22, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#6f8be3";
      g.beginPath();
      g.arc(88, 44, 20, 0, Math.PI * 2);
      g.fill();
    });
  }

  private doorSignTexture() {
    return canvasTexture(256, 124, (g) => {
      g.fillStyle = "#f5efe2";
      g.beginPath();
      g.roundRect(6, 22, 244, 96, 14);
      g.fill();
      g.strokeStyle = "#2a2e44";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(70, 24);
      g.lineTo(128, 2);
      g.lineTo(186, 24);
      g.stroke();
      g.fillStyle = "#2a2e44";
      g.textAlign = "center";
      g.font = "800 34px ui-rounded, 'Segoe UI', system-ui, sans-serif";
      g.fillText("SLEEPING", 128, 64);
      g.font = "700 22px ui-rounded, 'Segoe UI', system-ui, sans-serif";
      g.fillStyle = "#e0527a";
      g.fillText("do not knock", 128, 98);
    });
  }

  private neonSignTexture() {
    return canvasTexture(512, 128, (g) => {
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.font = "800 82px ui-rounded, 'Segoe UI', system-ui, sans-serif";
      g.shadowColor = NEON_PINK;
      g.shadowBlur = 26;
      g.fillStyle = "#ffd3e6";
      g.fillText("MIKURO", 256, 66);
      g.shadowBlur = 8;
      g.fillText("MIKURO", 256, 66);
    });
  }

  private moonTexture() {
    return canvasTexture(256, 256, (g) => {
      const halo = g.createRadialGradient(128, 128, 30, 128, 128, 128);
      halo.addColorStop(0, "rgba(255,255,255,0.5)");
      halo.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = halo;
      g.fillRect(0, 0, 256, 256);
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.arc(128, 128, 38, 0, Math.PI * 2);
      g.fill();
    });
  }

  // -------------------------------------------------------------------
  // Controls
  // -------------------------------------------------------------------
  setTheme(dark: boolean) {
    this.palette = PALETTES[dark ? "dark" : "light"];
    this.applyTheme();
    if (!this.running) this.renderOnce();
  }

  private applyTheme() {
    const p = this.palette;
    (this.scene.fog as THREE.Fog).color.set(p.fog);
    this.hemi.color.set(p.hemiSky);
    this.hemi.groundColor.set(p.hemiGround);
    this.hemi.intensity = p.hemi;
    this.key.color.set(p.key);
    this.key.intensity = p.keyI;
    this.mats.snow.color.set(p.snow);
    this.mats.body.color.set(p.body);
    this.mats.bodyDark.color.set(p.bodyDark);
    this.mats.pine.color.set(p.pine);
    this.mats.path.color.set(p.path);
    for (const paw of this.paws) paw.mat.color.set(p.paw);
    this.snowMat.uniforms.uColor.value.set(p.flake);
    this.snowMat.uniforms.uOpacity.value = p.flakeOpacity;
    const moon = this.moon.material as THREE.SpriteMaterial;
    moon.color.set(p.moon);
    moon.opacity = p.moonOpacity;
    this.stars.visible = p === PALETTES.dark;
    const dark = p === PALETTES.dark;
    for (const g of this.glows) (g.sprite.material as THREE.SpriteMaterial).opacity = g.base * (dark ? 1 : 0.6);
  }

  setPointer(x: number, y: number) {
    this.pointer = [clamp(x, -1, 1), clamp(y, -1, 1)];
  }

  setDoor(open: boolean) {
    this.doorOpen = open;
    if (this.reduced) this.door.x = open ? -1.7 : 0;
  }

  knock() {
    if (this.reduced) return;
    this.rattle.v += 9;
  }

  /** The door slams open from the inside. */
  burst() {
    this.doorOpen = true;
    if (this.reduced) {
      this.door.x = -1.7;
      return;
    }
    this.door.v = -16;
    this.squash.v += 6;
    this.camShake = 1;
    this.gust = 1;
  }

  setSleeping(on: boolean) {
    this.sleeping = on;
  }

  /** Glowing eyes in the doorway, for when Mikuro herself is switched off. */
  setEyes(on: boolean) {
    this.eyesOn = on;
  }

  /** Paw prints appear one by one towards the door (0 → 1). */
  walkPaws() {
    this.pawTarget = 1;
    this.pawFade = 1;
  }

  setSize(w: number, h: number) {
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    this.renderer.setSize(this.w, this.h, false);
    this.camera.aspect = this.w / this.h;
    this.camera.updateProjectionMatrix();
    this.snowMat.uniforms.uPixel.value = (this.h * this.renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
    if (!this.running) this.renderOnce();
  }

  start() {
    if (this.running || this.disposed) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.update(dt);
      this.renderer.render(this.scene, this.camera);
      this.report();
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  renderOnce() {
    if (this.disposed) return;
    this.update(0);
    this.renderer.render(this.scene, this.camera);
    this.report();
  }

  dispose() {
    this.stop();
    this.disposed = true;
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
      for (const mat of Array.isArray(m) ? m : m ? [m] : []) {
        for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
        mat.dispose();
      }
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  // -------------------------------------------------------------------
  // Animation
  // -------------------------------------------------------------------
  private update(dt: number) {
    const r = this.reduced;
    if (!r) this.t += dt;
    const t = this.t;

    // camera: frame the house on any aspect, drift with the pointer
    const aspect = this.w / this.h;
    const narrow = clamp(1.35 / aspect, 1, 2.6);
    const dist = 9.4 * Math.pow(narrow, 0.72);
    this.cam.x = damp(this.cam.x, r ? 0 : this.pointer[0] * 0.7, 2.5, dt);
    this.cam.y = damp(this.cam.y, r ? 0 : this.pointer[1] * -0.3, 2.5, dt);
    this.camShake = damp(this.camShake, 0, 3.2, dt);
    const shake = this.camShake * 0.09;
    this.camera.position.set(
      this.cam.x + Math.sin(t * 61) * shake,
      1.95 + (narrow - 1) * 0.9 + this.cam.y + Math.cos(t * 53) * shake,
      dist,
    );
    this.camera.lookAt(0, 1.3 + (narrow - 1) * 0.35, 0);

    // door swing, knock rattle, house squash
    const angle = r ? this.door.x : this.door.step(this.doorOpen ? -1.7 : 0, dt);
    const rattle = r ? 0 : this.rattle.step(0, dt);
    this.doorPivot.rotation.set(0, angle, rattle * 0.012);
    this.doorPivot.position.z = 1.31 + Math.abs(rattle) * 0.004;
    const sq = r ? 0 : this.squash.step(0, dt);
    this.house.scale.set(1 - sq * 0.012, 1 + sq * 0.03, 1 - sq * 0.012);

    // sleeping: dim windows, warm night light inside, zzz and smoke
    this.sleepAmt = damp(this.sleepAmt, this.sleeping ? 1 : 0, 2.2, dt || 1);
    const s = this.sleepAmt;
    this.mats.window.color.setRGB(1 - s * 0.55, 1 - s * 0.6, 1 - s * 0.35);
    this.mats.interior.color.set("#ffb36b").lerp(new THREE.Color("#3b2a66"), s);
    this.mats.doorSign.opacity = 0.15 + s * 0.85;
    this.porchLight.intensity = 6 - s * 3.5 + (this.doorOpen ? 4 : 0);
    for (const z of this.zzz) {
      const f = (t * 0.33 + z.phase) % 1;
      z.sprite.position.set(0.15 + f * 0.9 + Math.sin(f * 6 + z.phase * 5) * 0.08, 2.55 + f * 1.4, 1.42);
      z.sprite.scale.setScalar(0.18 + f * 0.32);
      (z.sprite.material as THREE.SpriteMaterial).opacity = Math.sin(f * Math.PI) * s * 0.95;
    }
    for (const p of this.smoke) {
      const f = (t * 0.16 + p.phase) % 1;
      p.sprite.position.set(-1.0 + f * 0.9 + Math.sin(f * 5 + p.phase * 7) * 0.12, 3.35 + f * 1.8, -0.45);
      p.sprite.scale.setScalar(0.35 + f * 1.1);
      (p.sprite.material as THREE.SpriteMaterial).opacity = Math.sin(f * Math.PI) * (0.12 + s * 0.2);
    }

    // eyes in the doorway
    this.eyesAmt = damp(this.eyesAmt, this.eyesOn ? 1 : 0, 6, dt || 1);
    this.eyes.visible = this.eyesAmt > 0.01;
    for (const c of this.eyes.children) ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = this.eyesAmt;

    // paw prints: revealed one by one, then slowly snowed over
    this.pawAmt = r ? this.pawTarget : damp(this.pawAmt, this.pawTarget, 1.2, dt);
    if (this.pawAmt > 0.98) this.pawFade = Math.max(0.25, this.pawFade - dt * 0.02);
    const n = this.paws.length;
    this.paws.forEach((p, i) => {
      p.mat.opacity = clamp(this.pawAmt * (n + 1) - i, 0, 1) * this.palette.pawOpacity * this.pawFade;
    });

    // neon flicker, beacon blink, fairy lights
    const dark = this.palette === PALETTES.dark;
    for (const g of this.glows) {
      if (!g.flicker) continue;
      const f = r ? 1 : 0.85 + Math.sin(t * 7.3) * 0.05 + (Math.sin(t * 23) > 0.97 ? -0.4 : 0);
      (g.sprite.material as THREE.SpriteMaterial).opacity = g.base * f * (dark ? 1 : 0.6);
    }
    this.mats.beacon.color.set(Math.sin(t * 3) > 0.2 || r ? "#ff3b4f" : "#4a1820");
    for (const b of this.bulbs) b.mat.opacity = r ? 1 : 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 2.4 + b.phase));

    // snow
    this.gust = damp(this.gust, 0, 1.6, dt);
    this.snowMat.uniforms.uTime.value = r ? 4 : t;
    this.snowMat.uniforms.uGust.value = this.gust;
  }

  private spot(local: THREE.Vector3, worldSize: number): ScreenSpot {
    this.house.updateMatrixWorld();
    const p = this.house.localToWorld(this.v.copy(local));
    const dist = this.camera.position.distanceTo(p);
    p.project(this.camera);
    const px = (worldSize / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * dist)) * this.h;
    return { x: (p.x * 0.5 + 0.5) * this.w, y: (-p.y * 0.5 + 0.5) * this.h, s: px };
  }

  private report() {
    if (!this.onFrame) return;
    const door = this.spot(new THREE.Vector3(0, 0.71, 1.32), 1.42);
    this.onFrame({
      path: this.spot(new THREE.Vector3(-2.35, 0.8, 2.9), 1.45),
      door: this.spot(new THREE.Vector3(0, 0.78, 1.55), 1.2),
      inside: this.spot(new THREE.Vector3(0, 0.7, 1.1), 0.5),
      out: this.spot(new THREE.Vector3(0, 1.1, 2.7), 1.9),
      doorRect: { x: door.x - door.s * 0.33, y: door.y - door.s / 2, w: door.s * 0.66, h: door.s },
    });
  }
}
