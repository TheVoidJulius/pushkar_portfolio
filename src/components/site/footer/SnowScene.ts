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
    pts.renderOrder = -9;
    pts.frustumCulled = false;
    this.scene.add(pts);
    return pts;
  }

  /** Terrain height: drifts, ripples of dunes, a flat pad for the igloo. */
  height(x: number, z: number) {
    const n = this.noise;
    const r = Math.hypot(x, z);
    let h = 0;
    h += (n(x * 0.045, z * 0.045) + n(x * 0.11 + 5.2, z * 0.11 - 1.7) * 0.45) * 0.95;
    // wind-carved drift ridges, stretched across the wind
    const dr = n(x * 0.022 + 13.1, z * 0.1 - 4.2);
    h += Math.pow(1 - Math.abs(dr), 3) * 0.75;
    // gentler in front, where the camera looks across the snow
    h *= 1 - smooth(1, 9, z) * 0.45;
    // a rise behind the igloo
    const back = smooth(-4, -40, z);
    const ridged = 1 - Math.abs(this.noise2(x * 0.035, z * 0.035));
    h += back * (ridged * ridged * 3.2 + n(x * 0.02, z * 0.02) * 1.4 + 0.9);
    // a big soft dune framing the bottom left
    h += 1.6 * Math.exp(-((x + 7.5) ** 2) / 14 - ((z - 6.5) ** 2) / 7);
    h += 0.9 * Math.exp(-((x - 8.5) ** 2) / 10 - ((z - 3.5) ** 2) / 9);
    // flat pad under the igloo and in front of the entrance
    const mx = x - this.mouth.x * 1.15;
    const mz = z - this.mouth.z * 1.15;
    const pad = Math.min(smooth(3.0, 6.8, r), smooth(1.6, 4.2, Math.hypot(mx, mz)));
    h *= pad;
    // snow banked against the base, except at the tunnel
    const ang = Math.atan2(x, z);
    const off = Math.abs(Math.atan2(Math.sin(ang - this.doorYaw), Math.cos(ang - this.doorYaw)));
    const bank = Math.exp(-(((r - this.R - 0.15) / 0.55) ** 2)) * 0.22 * smooth(0.45, 0.8, off);
    return h + bank - 0.02;
  }

  private buildTerrain() {
    const W = 150;
    const Dp = 95;
    const geo = new THREE.PlaneGeometry(W, Dp, this.mobile ? 150 : 240, this.mobile ? 100 : 160);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, -22);
    // heights are filled in a few slices at a time by sculpt(), off the main path
    this.sculptJobs.push({ geo, f: (x, z) => this.height(x, z) });
    const mesh = new THREE.Mesh(geo, this.snowMat);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  private buildMountains() {
    const bands = [
      { z: -78, amp: 16, f: 0.028, seed: 3, x: 0 },
      { z: -112, amp: 26, f: 0.018, seed: 11, x: 30 },
      { z: -150, amp: 38, f: 0.012, seed: 19, x: -40 },
    ];
    for (const b of bands) {
      const nz = makeNoise(b.seed);
      const geo = new THREE.PlaneGeometry(420, 46, this.mobile ? 120 : 200, 18);
      geo.rotateX(-Math.PI / 2);
      const f = (xl: number, zl: number) => {
        const x = xl + b.x;
        const t = (zl + 23) / 46;
        let ridge = 0;
        let a = 1;
        let fr = b.f;
        for (let o = 0; o < 5; o++) {
          const v = 1 - Math.abs(nz(x * fr, zl * fr + o * 7));
          ridge += v * v * a;
          a *= 0.5;
          fr *= 2.1;
        }
        const bell = Math.sin(Math.PI * clamp(t, 0, 1)) ** 0.8;
        return (ridge * 0.62 - 0.12) * b.amp * bell;
      };
      this.sculptJobs.push({ geo, f });
      const mesh = new THREE.Mesh(geo, this.mountainMat);
      mesh.position.set(0, -2, b.z);
      this.scene.add(mesh);
    }

  private buildMist() {
    const tex = canvasTexture(4, 128, (g) => {
      const gr = g.createLinearGradient(0, 0, 0, 128);
      gr.addColorStop(0, "rgba(255,255,255,0)");
      gr.addColorStop(0.55, "rgba(255,255,255,0.55)");
      gr.addColorStop(1, "rgba(255,255,255,0.85)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 4, 128);
    });
    const layers = [
      { z: -26, y: 4, h: 12, o: 0.45 },
      { z: -58, y: 3, h: 20, o: 0.7 },
      { z: -96, y: 2, h: 30, o: 0.75 },
      { z: -132, y: 4, h: 34, o: 0.8 },
    ];
    for (const l of layers) {
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, fog: false, opacity: l.o });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(520, l.h), mat);
      mesh.position.set(0, l.y + l.h / 2 - 3, l.z);
      this.scene.add(mesh);
      this.mists.push({ mesh, mat, base: l.o });
    }
  }

  /** The dome (a spiral of blocks), the entrance tunnel and loose chunks. */
  private buildIgloo() {
    const R = this.R;
    const H = this.H;
    const BW = 0.6;
    const BH = 0.4;
    const BD = 0.34;
    const geo = new RoundedBoxGeometry(BW, BH, BD, this.mobile ? 1 : 2, 0.075);
    const rnd = mulberry(17);
    type Inst = { pos: THREE.Vector3; quat: THREE.Quaternion; scale: THREE.Vector3; normal: THREE.Vector3; theta: number; floater: boolean; tint: number };
    const list: Inst[] = [];

    const rc = R - BD / 2; // radius at the block centres
    const hc = H - BD / 2;
    const dTheta = 0.44 / ((rc + hc) / 2);
    const thetaMax = 1.36;
    const up = new THREE.Vector3(0, 1, 0);
    const basis = new THREE.Matrix4();
    const tx = new THREE.Vector3();
    const ty = new THREE.Vector3();
    const nrm = new THREE.Vector3();

    // spiral: elevation climbs one block height per turn
    let phiAcc = 0;
    let theta = -dTheta * 0.55;
    while (theta < thetaMax) {
      const ringR = rc * Math.cos(theta);
      const spacing = 0.655;
      const dPhi = spacing / Math.max(ringR, 0.3);
      const phi = phiAcc;
      const ct = Math.cos(theta);
      const st = Math.sin(theta);
      const pos = new THREE.Vector3(rc * ct * Math.sin(phi), hc * st, rc * ct * Math.cos(phi));
      nrm.set((ct * Math.sin(phi)) / rc, st / hc, (ct * Math.cos(phi)) / rc).normalize();
      tx.set(Math.cos(phi), 0, -Math.sin(phi));
      ty.crossVectors(nrm, tx).normalize();
      basis.makeBasis(tx, ty, nrm);
      const quat = new THREE.Quaternion().setFromRotationMatrix(basis);
      // follow the spiral's slope
      const slope = Math.atan2(dTheta * hc, Math.PI * 2 * Math.max(ringR, 0.3));
      quat.multiply(this.q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), slope));
      // leave a hole for the tunnel
      const rel = Math.atan2(Math.sin(phi - this.doorYaw), Math.cos(phi - this.doorYaw));
      const lateral = Math.abs(Math.sin(rel)) * rc * ct;
      // (only blocks whose centre sits well inside the arch, so no gaps show)
      const archTop = 0.36 + Math.sqrt(Math.max(0, 0.68 * 0.68 - lateral * lateral));
      const inDoor = Math.abs(rel) < Math.PI / 2 && lateral < 0.68 && pos.y < archTop;
      if (!inDoor && pos.y > -0.25) {
        const shrink = (Math.min(spacing, ringR * dPhi) - 0.05) / BW;
        list.push({
          pos,
          quat,
          scale: new THREE.Vector3(clamp(shrink, 0.6, 1.05) * (0.97 + rnd() * 0.05), 0.95 + rnd() * 0.06, 0.95 + rnd() * 0.1),
          normal: nrm.clone(),
          theta,
          floater: theta > 0.98,
          tint: rnd(),
        });
      }
      phiAcc += dPhi;
      theta += (dTheta * dPhi) / (Math.PI * 2);
    }
    // cap stone
    {
      const quat = new THREE.Quaternion().setFromRotationMatrix(basis.makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), up));
      list.push({ pos: new THREE.Vector3(0, H - 0.13, 0), quat, scale: new THREE.Vector3(1.75, 2.6, 0.85), normal: up.clone(), theta: Math.PI / 2, floater: true, tint: rnd() });
    }

    // entrance tunnel: three arches of blocks on short walls
    const D = this.D;
    const Lt = this.L;
    const yc = 0.36;
    const rMid = 0.79;
    const segLen = 0.47;
    const segs = 4;
    for (let s = 0; s < segs; s++) {
      const along = this.mouthDist - segLen * (s + 0.5);
      const centre = D.clone().multiplyScalar(along);
      const count = 5;
      const offset = s % 2 ? 0.5 : 0;
      for (let k = 0; k < count + (s % 2 ? -1 : 0); k++) {
        const a = ((k + 0.5 + offset) / count) * Math.PI;
        const radial = Lt.clone().multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a));
        const pos = centre.clone().addScaledVector(radial, rMid).setY(yc + Math.sin(a) * rMid);
        // x along the arch, y along the tunnel, z outwards
        const tArc = Lt.clone().multiplyScalar(-Math.sin(a)).addScaledVector(up, Math.cos(a));
        const yAxis = new THREE.Vector3().crossVectors(radial, tArc).normalize();
        basis.makeBasis(tArc, yAxis, radial);
        const quat = new THREE.Quaternion().setFromRotationMatrix(basis);
        list.push({ pos, quat, scale: new THREE.Vector3(0.86 + rnd() * 0.06, 1.08, 0.95), normal: radial, theta: 0, floater: false, tint: rnd() });
      }
      // short walls under the arch springs
      for (const side of [-1, 1]) {
        const radial = Lt.clone().multiplyScalar(side);
        const pos = centre.clone().addScaledVector(radial, rMid).setY(0.17);
        const yAxis = new THREE.Vector3().crossVectors(radial, up).normalize();
        basis.makeBasis(up.clone().multiplyScalar(side), yAxis.multiplyScalar(side), radial);
        const quat = new THREE.Quaternion().setFromRotationMatrix(basis);
        list.push({ pos, quat, scale: new THREE.Vector3(0.62, 1.1, 0.95), normal: radial, theta: 0, floater: false, tint: rnd() });
      }
    }

    // loose chunks and snowballs in the snow
    for (let i = 0; i < 7; i++) {
      const a = this.doorYaw + (rnd() < 0.5 ? -1 : 1) * (0.8 + rnd() * 1.5);
      const r = R + 0.6 + rnd() * 1.6;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      const pos = new THREE.Vector3(x, this.height(x, z) + 0.05, z);
      const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 0.6, rnd() * 6, rnd() * 0.6));
      const s = 0.4 + rnd() * 0.35;
      list.push({ pos, quat, scale: new THREE.Vector3(s, s, s), normal: up.clone(), theta: 0, floater: false, tint: rnd() });
    }

    const mesh = new THREE.InstancedMesh(geo, this.iceMat, list.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const c = new THREE.Color();
    const maxTheta = Math.max(...list.filter((b) => b.floater).map((b) => b.theta));
    list.forEach((b, i) => {
      this.m4.compose(b.pos, b.quat, b.scale);
      mesh.setMatrixAt(i, this.m4);
      const v = 0.9 + b.tint * 0.1;
      c.setRGB(v, v + 0.005, v + 0.02 * (1 - b.tint));
      mesh.setColorAt(i, c);
      if (b.floater) {
        const hNorm = clamp((b.theta - 0.98) / (maxTheta - 0.98), 0, 1);
        const lat = new THREE.Vector3(rnd() - 0.5, 0, rnd() - 0.5).multiplyScalar(0.6);
        this.floaters.push({
          index: i,
          pos: b.pos.clone(),
          quat: b.quat.clone(),
          scale: b.scale.clone(),
          normal: b.normal.clone(),
          dir: b.normal.clone().multiplyScalar(0.75).add(new THREE.Vector3(0, 1, 0)).add(lat).normalize(),
          dist: 0.3 + hNorm * 1.05 + rnd() * 0.3,
          axis: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(),
          angle: 0.25 + rnd() * 0.6,
          delay: 1 - hNorm,
          phase: rnd() * 6.28,
          depth: (BD / 2) * b.scale.z,
        });
      }
    }
    const floor = new THREE.Mesh(new THREE.PlaneGeometry((rMid - BD / 2) * 2, segLen * segs + 0.6), this.tunnelGlowMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -yc + 0.02;
    holder.add(floor);
    this.scene.add(holder);
  }

  /** The ice-slab door in the tunnel mouth, hinged on one side. */
  private buildDoor() {
    const w = 1.18;
    const r = w / 2;
    const straight = 0.36;
    const shape = new THREE.Shape();
    shape.moveTo(-r, 0);
    shape.lineTo(r, 0);
    shape.lineTo(r, straight);
    shape.absarc(0, straight, r, 0, Math.PI, false);
    shape.lineTo(-r, 0);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3, curveSegments: 24 });
    geo.translate(r, 0, -0.05);
    const slab = new THREE.Mesh(geo, this.doorMat);
    slab.castShadow = true;
    slab.receiveShadow = true;
    // a hide strap handle to knock on
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.018, 8, 20), new THREE.MeshStandardMaterial({ color: "#5a4636", roughness: 0.8 }));
    handle.position.set(w * 0.78, straight * 0.95, 0.1);
    this.doorPivot.add(slab, handle);
    this.doorPivot.position.set(-r, 0, 0);
    this.doorGroup.add(this.doorPivot);
    this.doorGroup.position.copy(this.mouth).addScaledVector(this.D, -0.08).setY(0.02);
    this.doorGroup.rotation.y = this.doorYaw;
    this.scene.add(this.doorGroup);

    // angry eyes in the dark tunnel (when Mikuro herself is switched off)
    for (const x of [-0.14, 0.14]) {
      const e = new THREE.Mesh(new THREE.CircleGeometry(0.065, 20), new THREE.MeshBasicMaterial({ color: "#ff3b30", toneMapped: false, transparent: true, fog: false }));
      e.scale.y = 0.55;
      e.rotation.z = x > 0 ? 0.35 : -0.35;
      e.position.set(x, 0, 0);
      this.eyes.add(e);
    }
    this.eyes.position.copy(this.mouth).addScaledVector(this.D, -0.45).setY(0.62);
    this.eyes.rotation.y = this.doorYaw;
    this.eyes.visible = false;
    this.scene.add(this.eyes);
  }

  /** Numbers and hairlines on the floating blocks. */
  private buildLabels() {
    const picks = [0.12, 0.3, 0.45, 0.58, 0.7, 0.84, 0.96].map((f) => this.floaters[Math.floor(f * (this.floaters.length - 1))]);
    this.labelled = picks.filter(Boolean);
    this.labelled.forEach((_, i) => {
      const tex = canvasTexture(128, 48, (g) => {
        g.font = "500 34px ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
        g.textBaseline = "middle";
        g.fillStyle = "#ffffff";
        g.fillText(LABELS[i % LABELS.length], 14, 26);
      });
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false, toneMapped: false, fog: false }));
      s.center.set(0, 0.5);
      s.renderOrder = 20;
      this.scene.add(s);
      this.labels.push(s);
    });
    const n = this.labelled.length;
    const segs: number[] = [];
    for (let i = 0; i < n - 1; i++) if (i !== 2) segs.push(i, i + 1);
    const lgeo = new THREE.BufferGeometry();
    lgeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(segs.length * 3), 3));
    lgeo.userData.pairs = segs;
    this.labelLines = new THREE.LineSegments(lgeo, new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false }));
    this.labelLines.renderOrder = 19;
    this.labelLines.frustumCulled = false;
    const dgeo = new THREE.BufferGeometry();
    dgeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.labelDots = new THREE.Points(
      dgeo,
      new THREE.PointsMaterial({ color: "#ffffff", size: 4.5, sizeAttenuation: false, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false }),
    );
    this.labelDots.renderOrder = 19;
    this.labelDots.frustumCulled = false;
    this.scene.add(this.labelLines, this.labelDots);
  }

  /** Warm light pooling on the snow outside the entrance. */
  private buildWarmth() {
    this.poolMat = new THREE.MeshBasicMaterial({ map: this.radial, color: WARM, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0.5 });
    this.pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.poolMat);
    this.pool.rotation.x = -Math.PI / 2;
    this.pool.rotation.z = this.doorYaw;
    this.pool.scale.set(3.2, 4.4, 1);
    this.pool.position.copy(this.mouth).addScaledVector(this.D, 1.2).setY(0.04);
    this.pool.renderOrder = 2;
    this.scene.add(this.pool);
    this.mouthGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.radial, color: WARM, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0.4 }),
    );
    this.mouthGlow.position.copy(this.mouth).addScaledVector(this.D, 0.25).setY(0.55);
    this.mouthGlow.scale.set(2.4, 2.0, 1);
    this.scene.add(this.mouthGlow);
  }

  private buildPaws() {
    const end = this.mouth.clone().addScaledVector(this.D, 0.7);
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-6.2, 0, 8.4), new THREE.Vector3(-1.2, 0, 6.6), end);
    this.pathCurve = curve;
    const N = 14;
    const pad = new THREE.CircleGeometry(0.085, 16);
    const toe = new THREE.CircleGeometry(0.035, 10);
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const p = curve.getPoint(t);
      const tan = curve.getTangent(t);
      const side = i % 2 ? 1 : -1;
  }
      const mat = new THREE.MeshBasicMaterial({ color: "#7c8596", transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const g = new THREE.Group();
      const padM = new THREE.Mesh(pad, mat);
      padM.scale.set(1, 0.85, 1);
      g.add(padM);
      for (const [x, y] of [
        [-0.075, 0.095],
        [0, 0.125],
        [0.075, 0.095],
      ]) {
        const tm = new THREE.Mesh(toe, mat);
        tm.position.set(x, y, 0);
        g.add(tm);
      }
      g.rotation.x = -Math.PI / 2;
      g.rotation.z = Math.atan2(-tan.x, -tan.z);
      const x = p.x + tan.z * 0.13 * side;
      const z = p.z - tan.x * 0.13 * side;
      g.position.set(x, this.height(x, z) + 0.025, z);
      this.scene.add(g);
      this.paws.push({ mesh: g, mat });
    }
  }

  /** A tiny neon "MIKURO" on a stake by the entrance. */
  private buildSign() {
    const tex = canvasTexture(512, 128, (g) => {
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.font = "700 76px ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
      g.shadowColor = NEON;
      g.shadowBlur = 22;
      g.fillStyle = "#ffd3e6";
      g.fillText("MIKURO", 256, 66);
      g.shadowBlur = 6;
      g.fillText("MIKURO", 256, 66);
    });
    this.neonMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false });
    const g = new THREE.Group();
    const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.95, 6), new THREE.MeshStandardMaterial({ color: "#3a3f4a", roughness: 0.7 }));
    stake.position.y = 0.42;
    stake.castShadow = true;
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.195), this.neonMat);
    plate.position.y = 0.92;
    g.add(stake, plate);
    const at = this.mouth.clone().addScaledVector(this.D, 0.55).addScaledVector(this.L, 1.15);
    g.position.set(at.x, this.height(at.x, at.z), at.z);
    g.rotation.y = this.doorYaw - 0.35;
    this.scene.add(g);
    this.neonGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.radial, color: NEON, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0.3 }),
    );
    this.neonGlow.position.set(at.x, g.position.y + 0.92, at.z + 0.02);
    this.neonGlow.scale.set(1.5, 0.6, 1);
    this.scene.add(this.neonGlow);
  }

  private buildSleepy() {
    const zTex = canvasTexture(128, 128, (g) => {
      g.font = "500 92px ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.shadowColor = WARM;
      g.shadowBlur = 14;
      g.fillStyle = "#fff4ea";
      g.fillText("z", 64, 64);
    });
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: zTex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
      this.scene.add(s);
      this.zzz.push({ sprite: s, phase: i / 3 });
    }
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.radial, color: "#f2f4f8", transparent: true, opacity: 0, depthWrite: false }));
      this.scene.add(s);
      this.steam.push({ sprite: s, phase: i / 6 });
    }
  }

  private buildParticles(count: number, o: { x: number; y: number; z0: number; z1: number; size: number; fall: number; streak: boolean }) {
    const rnd = mulberry(count + (o.streak ? 99 : 1));
    const pos = new Float32Array(count * 3);
    const r = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (rnd() * 2 - 1) * o.x;
      pos[i * 3 + 1] = rnd() * o.y;
      pos[i * 3 + 2] = o.z0 + rnd() * (o.z1 - o.z0);
      r[i * 3] = rnd();
      r[i * 3 + 1] = rnd();
      r[i * 3 + 2] = rnd();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aRand", new THREE.BufferAttribute(r, 3));
    const mat = new THREE.ShaderMaterial({
      vertexShader: FLAKE_VERT,
      fragmentShader: FLAKE_FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uGust: { value: 0 },
        uGustOrigin: { value: this.mouth.clone().setY(0.6) },
        uBox: { value: new THREE.Vector3(o.x, o.y, 0) },
        uPixel: { value: 600 },
        uColor: { value: new THREE.Color("#ffffff") },
        uOpacity: { value: 0.9 },
        uSlant: { value: 0 },
        uStreak: { value: o.streak ? 1 : 0 },
      },
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
    return mat;
  }

  // -------------------------------------------------------------------
  // Look: theme × time of day × weather
  // -------------------------------------------------------------------
  private applyLook() {
    const w = this.weather;
    this.mode = this.dark ? "night" : w && !w.isDay ? "dusk" : "day";
    const L = LOOKS[this.mode];
    this.look = L;
    const night = this.mode !== "day";
    const cond = w?.condition ?? "clear";
    const rain = cond === "rain" || cond === "storm";
    const haze = Boolean(w?.haze);
    const hot = (w?.temp ?? 0) > HOT_TEMP;
    const col = (c: string) => new THREE.Color(c);

    const top = col(L.skyTop);
    const hor = col(L.horizon);
    const fog = col(L.fog);
    const sun = col(L.sun);
    const key = col(L.key);
    let density = L.fogDensity;
    let keyI = L.keyI;
    let mist = L.mist;
    let disc = L.sunDisc;
    let halo = L.sunHalo;
    const snow = col(L.snow);
    let rough = L.snowRough;

    if (haze) {
      const smog = col(this.mode === "night" ? "#3d3427" : this.mode === "dusk" ? "#a88f78" : "#b7aa92");
      top.lerp(smog, 0.55);
      hor.lerp(smog, 0.7);
      fog.lerp(smog, 0.75);
      density *= 1.7;
      keyI *= 0.7;
      key.lerp(col("#ffcf94"), 0.5);
      sun.lerp(col("#ffb070"), 0.7);
      disc *= 0.7;
      halo *= 1.8;
      mist = Math.min(0.95, mist * 1.5);
      snow.lerp(col("#d8d2c6"), night ? 0.15 : 0.3);
    }
    if (cond === "fog") {
      density *= 5.2;
      mist = 0.95;
      keyI *= 0.55;
      disc *= 0.2;
      top.lerp(fog, 0.5);
      hor.lerp(fog, 0.8);
    }
    if (cond === "cloudy") {
      top.lerp(hor, 0.3);
      disc *= 0.3;
      keyI *= 0.85;
    }
    if (rain) {
      const dim = cond === "storm" ? 0.55 : 0.78;
      top.multiplyScalar(dim);
      hor.multiplyScalar(0.5 + dim * 0.5);
      fog.multiplyScalar(0.55 + dim * 0.45);
      density *= 1.35;
      keyI *= cond === "storm" ? 0.45 : 0.65;
      disc *= 0.1;
      snow.multiplyScalar(0.84);
      rough = 0.38;
    }
    if (hot) {
      key.lerp(col("#ffe2b8"), 0.4);
      keyI *= 1.1;
    }

    this.fog.color.copy(fog);
    this.fog.density = density;
    const u = this.skyMat.uniforms;
    u.uTop.value.copy(top);
    u.uHorizon.value.copy(fog).lerp(hor, 0.35);
    u.uSun.value.copy(sun);
    u.uSunDir.value.set(...L.sunDir);
    u.uDisc.value = disc;
    u.uHalo.value = halo;

    this.hemi.color.set(L.hemiSky);
    this.hemi.groundColor.set(L.hemiGround);
    this.hemi.intensity = L.hemi * (rain ? 0.85 : 1);
    this.key.color.copy(key);
    this.key.intensity = keyI;
    this.key.position.set(...L.keyDir).normalize().multiplyScalar(22).add(this.key.target.position);
    this.snowUniforms.uLightDir.value.set(...L.keyDir).normalize();
    this.snowUniforms.uSparkle.value = rain ? 0.2 : night ? 0.6 : 1;
    this.snowUniforms.uRipple.value = rain ? 0.5 : 1;

    this.snowMat.color.copy(snow);
    this.snowMat.roughness = rough;
    this.mountainMat.color.set(L.mountain).lerp(fog, haze ? 0.45 : 0.15);
    this.iceMat.color.set(L.ice);
    if (rain) this.iceMat.color.multiplyScalar(0.9);
    this.iceUniforms.uRim.value.set(L.rim).multiplyScalar(L.rimAmt);
    this.doorMat.color.set(L.ice).multiplyScalar(0.95);

    for (const m of this.mists) {
      m.mat.color.copy(fog);
      m.mat.opacity = m.base * mist;
    }
    (this.stars.material as THREE.PointsMaterial).opacity = L.stars * (haze || cond === "fog" || rain ? 0.15 : 1);
    this.stars.visible = L.stars > 0;

    // particles
    const f = this.flakes.uniforms;
    f.uColor.value.set(L.flake);
    f.uOpacity.value = L.flakeOpacity;
    f.uDensity.value = cond === "snow" ? 1 : rain ? 0.2 : cond === "fog" ? 0.35 : haze ? 0.45 : 0.6;
    const s = this.sleet.uniforms;
    s.uColor.value.set(night ? "#9fb0d8" : "#c9d3e0");
    s.uOpacity.value = rain ? (cond === "storm" ? 0.55 : 0.4) : 0;
    s.uDensity.value = cond === "storm" ? 1 : 0.65;
    this.sleet.visible = rain;
    const d = this.drift.uniforms;
    d.uColor.value.set(L.flake);

    // labels & connectors: ink on the pale look, white at night
    const ink = col(L.ink);
    for (const l of this.labels) (l.material as THREE.SpriteMaterial).color.copy(ink);
    (this.labelLines.material as THREE.LineBasicMaterial).color.copy(ink);
    (this.labelDots.material as THREE.PointsMaterial).color.copy(ink);

    for (const p of this.paws) p.mat.color.set(L.paw);
    this.neonMat.opacity = L.neon;

    // heat
    this.dripMesh.visible = hot && !this.reduced;
    this.puddle.visible = hot;
    this.puddleMat.color.set(night ? "#1f2a40" : "#6e7c90");
    this.wet = hot ? 1 : rain ? 0.6 : 0;
    this.iceUniforms.uWet.value = this.wet;
    this.iceMat.roughness = hot ? 0.2 : 0.55;
  }

  // -------------------------------------------------------------------
  // Controls
  // -------------------------------------------------------------------
  /** Compile shaders off the main path so the first frame doesn't hitch. */
  private sculptJobs: { geo: THREE.BufferGeometry; f: (x: number, z: number) => number }[] = [];

  /** Displaces the terrain and mountains in ~8ms slices so scrolling stays smooth. */
  private async sculpt() {
    const nextTask = () => new Promise<void>((r) => setTimeout(r, 0));
    for (const job of this.sculptJobs) {
      const pos = job.geo.attributes.position as THREE.BufferAttribute;
      let i = 0;
      while (i < pos.count) {
        const until = performance.now() + 8;
        for (; i < pos.count && (i & 255 || performance.now() < until); i++) pos.setY(i, job.f(pos.getX(i), pos.getZ(i)));
        await nextTask();
        if (this.disposed) return;
      }
      job.geo.computeVertexNormals();
    });
    mesh.computeBoundingSphere();
    this.blocks = mesh;
    this.scene.add(mesh);

    // the warm inside, seen through the joints between blocks
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 18, 0, Math.PI * 2, 0, Math.PI / 2), this.glowMat);
    shell.scale.set(R - BD - 0.02, H - BD - 0.02, R - BD - 0.02);
    this.scene.add(shell);
    const tunnel = new THREE.Mesh(new THREE.CylinderGeometry(rMid - BD / 2 - 0.02, rMid - BD / 2 - 0.02, segLen * segs + 0.6, 20, 1, true, -Math.PI / 2, Math.PI), this.tunnelGlowMat);
    tunnel.rotation.set(Math.PI / 2, 0, 0);
    const holder = new THREE.Group();
    holder.add(tunnel);
    holder.position.copy(D).multiplyScalar(this.mouthDist - (segLen * segs) / 2 - 0.2).setY(yc);
    holder.rotation.y = this.doorYaw;
    // the tunnel's lower walls
    const walls = new THREE.Mesh(new THREE.PlaneGeometry(segLen * segs + 0.6, yc), this.tunnelGlowMat);
    for (const side of [-1, 1]) {
      const w = walls.clone();
      w.rotation.y = Math.PI / 2;
      w.position.set(side * (rMid - BD / 2 - 0.02), -yc / 2, 0);
      holder.add(w);
      job.geo.computeBoundingSphere();
      await nextTask();
    }
    this.sculptJobs.length = 0;
  }

  warm() {
    this.update(0);
    return this.sculpt()
      .then(() => (this.disposed ? undefined : this.renderer.compileAsync(this.scene, this.camera)))
      .catch(() => undefined)
      .then(() => {
        if (this.disposed) return;
        this.warmed = true;
        if (this.pendingStart) this.start();
        else this.renderOnce();
      });
  }

  setTheme(dark: boolean) {
    this.dark = dark;
    this.applyLook();
    if (!this.running) this.renderOnce();
  }

  setWeather(w: Weather) {
    this.weather = w;
    this.applyLook();
    if (!this.running) this.renderOnce();
  }

  /** 0 = section just entering at the bottom of the viewport, 1 = fully in view. */
  setScroll(p: number) {
    this.scroll = clamp(p, 0, 1);
  }

  setPointer(x: number, y: number) {
    this.pointer = [clamp(x, -1, 1), clamp(y, -1, 1)];
  }

  setDoor(open: boolean) {
    this.doorOpen = open;
    if (this.reduced) this.door.x = open ? -1.9 : 0;
  }

  knock() {
    if (this.reduced) return;
    this.rattle.v += 9;
  }

  /** The door slams open from the inside and the top of the igloo pops apart. */
  burst() {
    this.doorOpen = true;
    if (this.reduced) {
      this.door.x = -1.9;
      return;
    }
    this.door.v = -18;
    this.camShake = 1;
    this.gust = 1;
  }

  setSleeping(on: boolean) {
    this.sleeping = on;
  }

  setEyes(on: boolean) {
    this.eyesOn = on;
  }

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
    const px = (this.h * this.renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
    for (const m of [this.flakes, this.sleet, this.drift]) m.uniforms.uPixel.value = px;
    // labels: ~13px tall whatever the canvas height
    const k = (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / this.h;
    for (const l of this.labels) l.scale.set(40 * k, 15 * k, 1);
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
    if (this.disposed || !this.warmed) return;
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
    const w = this.weather;
    const L = this.look;

    // --- camera: a slow crane down as the section scrolls in, pointer parallax
    this.scrollEased = r ? 1 : dt ? damp(this.scrollEased, this.scroll, 4, dt) : this.scroll;
    const p = smooth(0, 1, this.scrollEased);
    this.ptr.x = damp(this.ptr.x, r ? 0 : this.pointer[0], 2.2, dt);
    this.ptr.y = damp(this.ptr.y, r ? 0 : this.pointer[1], 2.2, dt);
    const aspect = this.w / this.h;
    const tanH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    // keep the igloo + tunnel (≈ 4 units either side) in frame on any aspect
    const fitW = (aspect < 0.9 ? 3.75 : 4.3) / (tanH * aspect);
    const fitH = 3.1 / tanH;
    const dist = Math.max(fitW, fitH, 10.5) * (1 + (1 - p) * 0.28);
    const az = -0.14 + (1 - p) * -0.5 + this.ptr.x * 0.09;
    const el = 0.115 + (1 - p) * 0.3 - this.ptr.y * 0.035;
    this.camShake = damp(this.camShake, 0, 3.2, dt);
    const shake = this.camShake * 0.08;
    this.target.set(0.55, 1.05 + (1 - p) * 0.5 + (aspect < 0.9 ? 0.25 : 0), 0.9);
    this.camera.position.set(
      this.target.x + Math.sin(az) * Math.cos(el) * dist + Math.sin(t * 61) * shake,
      this.target.y + Math.sin(el) * dist + Math.cos(t * 53) * shake,
      this.target.z + Math.cos(az) * Math.cos(el) * dist,
    );
    this.camera.lookAt(this.target);
    this.sky.position.copy(this.camera.position);
    this.stars.position.copy(this.camera.position);

    // --- weather: wind and gusts
    const windBase = clamp((w?.wind ?? 6) / 14, 0.25, 3.2);
    const gustWave = Math.max(0, Math.sin(t * 0.21) * Math.sin(t * 0.67 + 1.3) + Math.sin(t * 0.13 + 2) * 0.4);
    const wind = windBase * (0.55 + gustWave * 1.4);
    if (!r) this.windOffset = (this.windOffset + wind * dt * 0.9) % 1000;
    this.gust = damp(this.gust, 0, 1.6, dt);
    for (const m of [this.flakes, this.sleet, this.drift]) {
      m.uniforms.uTime.value = r ? 4 : t;
      m.uniforms.uGust.value = this.gust;
    }
    this.flakes.uniforms.uWind.value = this.windOffset;
    this.sleet.uniforms.uWind.value = this.windOffset * 1.6;
    this.sleet.uniforms.uSlant.value = clamp(wind * 0.18, 0, 0.6);
    this.drift.uniforms.uWind.value = this.windOffset * 4.5;
    this.drift.uniforms.uOpacity.value = clamp((wind - 0.35) * 0.5, 0, 0.75) * (L.flakeOpacity * 0.8);

    // storm lightning
    if (w?.condition === "storm" && !r) {
      this.nextFlash -= dt;
      if (this.nextFlash < 0) {
        this.flash = 1;
        this.nextFlash = 3 + Math.random() * 6;
      }
    }
    this.flash = damp(this.flash, 0, 9, dt);
    const fl = this.flash > 0.02 ? this.flash * (0.6 + 0.4 * Math.sin(t * 90)) : 0;
    this.skyMat.uniforms.uFlash.value = fl * 0.6;
    this.hemi.intensity = L.hemi * (w?.condition === "rain" || w?.condition === "storm" ? 0.85 : 1) + fl * 2.5;

    // --- door swing and knock rattle
    const angle = r ? this.door.x : this.door.step(this.doorOpen ? -1.9 : 0, dt);
    const rattle = r ? 0 : this.rattle.step(0, dt);
    this.doorPivot.rotation.set(rattle * 0.006, angle + rattle * 0.004, rattle * 0.01);
    this.doorPivot.position.z = Math.abs(rattle) * 0.004;

    // --- the inside glow: warm when awake, a low amber when asleep, a blaze when open
    this.sleepAmt = damp(this.sleepAmt, this.sleeping ? 1 : 0, 2.2, dt || 1);
    const s = this.sleepAmt;
    const open = clamp(-angle / 1.9, 0, 1);
    const seamAmt = L.seamAwake + (L.seamAsleep - L.seamAwake) * s;
    const breath = r ? 1 : 0.94 + Math.sin(t * 1.3) * 0.04 + Math.sin(t * 7.1) * 0.015;
    const seam = this.glowMat.color.set(L.seam).multiplyScalar(seamAmt * breath);
    this.iceUniforms.uSeam.value.copy(seam).multiplyScalar(0.4);
    this.tunnelGlowMat.color.set(WARM).multiplyScalar((0.55 + open * 0.9) * L.warm * breath);
    this.warmLight.intensity = (1.4 + open * 15 + (1 - s) * 1.2) * L.warm * breath;
    this.warmLight.position.copy(this.mouth).addScaledVector(this.D, -0.55 + open * 0.95).setY(0.6);
    this.poolMat.opacity = (0.06 + open * 0.3 + (1 - s) * 0.04) * L.warm;
    (this.mouthGlow.material as THREE.SpriteMaterial).opacity = (0.12 + open * 0.45) * L.warm;
    this.doorMat.emissiveIntensity = (0.05 + (1 - s) * 0.04) * L.warm;
    (this.neonGlow.material as THREE.SpriteMaterial).opacity = L.neon * 0.35 * (r ? 1 : 0.9 + Math.sin(t * 7.3) * 0.05 + (Math.sin(t * 23) > 0.97 ? -0.35 : 0));

    // --- blocks floating apart / settling
    if (this.burstClock >= 0) {
      this.burstClock += dt;
      if (this.burstClock > 9) this.burstClock = -1;
    }
    const burstLift = (this.burstClock < 0 ? 0 : this.burstClock < 2.6 ? 1 : Math.exp(-(this.burstClock - 2.6) * 0.65)) * 0.78;
    const scrollLift = 1 - smooth(0.3, 0.94, this.scrollEased);
    const liftTarget = r ? 0 : Math.max(scrollLift, burstLift);
    this.liftNow = r || !dt ? liftTarget : this.lift.step(liftTarget, dt);
    this.placeFloaters(t);

    // --- zzz and steam from the vent
    const top = this.H + 0.1;
    for (const z of this.zzz) {
      const f = (t * 0.3 + z.phase) % 1;
      z.sprite.position.set(0.15 + f * 0.8 + Math.sin(f * 6 + z.phase * 5) * 0.08, top - 0.05 + f * 1.1, 0.3);
      z.sprite.scale.setScalar(0.18 + f * 0.3);
      (z.sprite.material as THREE.SpriteMaterial).opacity = Math.sin(f * Math.PI) * s * (1 - this.liftNow) * 0.95;
    }
    for (const st of this.steam) {
      const f = (t * 0.12 + st.phase) % 1;
      st.sprite.position.set(f * (0.6 + wind * 0.8) + Math.sin(f * 5 + st.phase * 7) * 0.15, top + f * 2.4, 0);
      st.sprite.scale.setScalar(0.5 + f * 1.6);
      (st.sprite.material as THREE.SpriteMaterial).opacity = Math.sin(f * Math.PI) * (this.mode === "day" ? 0.12 : 0.08) * (1 - this.liftNow * 0.6);
    }

    // --- eyes in the tunnel
  private pathCurve!: THREE.QuadraticBezierCurve3;

  /** Melting (hot days): drips running down the dome and a puddle. */
  private buildMelt() {
    const n = this.mobile ? 18 : 36;
    const rnd = mulberry(23);
    const mat = new THREE.MeshStandardMaterial({ color: "#d9efff", roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.85 });
    this.dripMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.04, 8, 6), mat, n);
    this.dripMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.dripMesh.visible = false;
    this.dripMesh.frustumCulled = false;
    for (let i = 0; i < n; i++) {
      let phi = rnd() * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(phi - this.doorYaw), Math.cos(phi - this.doorYaw))) < 0.5) phi += 1;
      this.drips.push({ phi, theta: 0.6 + rnd() * 0.7, speed: 0, drop: 0, y: 0, wait: rnd() * 4 });
    }
    this.scene.add(this.dripMesh);
    const soft = canvasTexture(
      64,
      64,
      (g) => {
        const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        r.addColorStop(0, "#fff");
        r.addColorStop(0.72, "#ddd");
        r.addColorStop(1, "#000");
        g.fillStyle = r;
        g.fillRect(0, 0, 64, 64);
      },
      false,
    );
    this.puddleMat = new THREE.MeshStandardMaterial({ color: "#5d6a7c", roughness: 0.04, metalness: 0.35, transparent: true, opacity: 0.6, alphaMap: soft, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
    this.puddle = new THREE.Mesh(new THREE.CircleGeometry(1, 48), this.puddleMat);
    this.puddle.rotation.x = -Math.PI / 2;
    this.puddle.scale.set(this.R + 1.1, this.R + 1.6, 1);
    this.puddle.position.set(0.25, 0.03, 0.35);
    this.puddle.visible = false;
    this.puddle.receiveShadow = true;
    this.scene.add(this.puddle);
  }
    this.eyesAmt = damp(this.eyesAmt, this.eyesOn ? 1 : 0, 6, dt || 1);
    this.eyes.visible = this.eyesAmt > 0.01;
    for (const c of this.eyes.children) ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = this.eyesAmt;

    // --- paw prints appear one by one, then slowly snow over
    this.pawAmt = r ? this.pawTarget : damp(this.pawAmt, this.pawTarget, 1.2, dt);
    if (this.pawAmt > 0.98) this.pawFade = Math.max(0.3, this.pawFade - dt * 0.02);
    const n = this.paws.length;
    this.paws.forEach((pw, i) => {
      pw.mat.opacity = clamp(this.pawAmt * (n + 1) - i, 0, 1) * L.pawOpacity * this.pawFade;
    });

    // --- melting
    if (this.dripMesh.visible) this.updateDrips(dt);
  }

  private placeFloaters(t: number) {
    const lift = Math.max(0, this.liftNow);
    const bobbing = lift > 0.002;
    if (!bobbing && this.lastLiftApplied === 0) {
      this.setLabelOpacity(0);
      return;
    }
    const mesh = this.blocks;
    for (const f of this.floaters) {
      const k = clamp((lift - f.delay * 0.45) / (1 - f.delay * 0.45), 0, 1.25);
      const a = k * k * (3 - 2 * Math.min(k, 1));
      const bob = bobbing ? Math.sin(t * 0.9 + f.phase) * 0.06 * a : 0;
      this.v.copy(f.pos).addScaledVector(f.dir, f.dist * a).y += bob;
      this.q.setFromAxisAngle(f.axis, f.angle * a + (bobbing ? Math.sin(t * 0.6 + f.phase) * 0.05 * a : 0));
      this.q2.copy(this.q).multiply(f.quat);
      this.m4.compose(this.v, this.q2, f.scale);
      mesh.setMatrixAt(f.index, this.m4);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.lastLiftApplied = bobbing ? lift : 0;

    // numbers + hairlines follow the labelled blocks
    const op = smooth(0.12, 0.55, lift);
    this.setLabelOpacity(op);
    if (op <= 0) return;
    const dots = this.labelDots.geometry.attributes.position as THREE.BufferAttribute;
    this.labelled.forEach((f, i) => {
      mesh.getMatrixAt(f.index, this.m4);
      // the dot sits on the block's outer face
      this.v2.set(0, 0, f.depth + 0.01).applyMatrix4(this.m4);
      dots.setXYZ(i, this.v2.x, this.v2.y, this.v2.z);
      this.labels[i].position.copy(this.v2);
    });

  private setLabelOpacity(o: number) {
    const vis = o > 0.01;
    this.labelLines.visible = vis;
    this.labelDots.visible = vis;
    (this.labelLines.material as THREE.LineBasicMaterial).opacity = o * 0.7;
    (this.labelDots.material as THREE.PointsMaterial).opacity = o;
    for (const l of this.labels) {
      l.visible = vis;
      (l.material as THREE.SpriteMaterial).opacity = o;
    }
  }

  private updateDrips(dt: number) {
    const rc = this.R + 0.02;
    const hc = this.H + 0.02;
    this.drips.forEach((d, i) => {
      if (d.wait > 0) {
        d.wait -= dt;
        this.s3.setScalar(0);
      } else if (d.theta > 0.05) {
        d.speed = Math.min(0.9, d.speed + dt * 0.35);
        d.theta -= d.speed * dt;
        d.y = hc * Math.sin(d.theta);
        this.s3.set(1, 1.5, 1);
      } else {
        d.drop += dt * 2.2;
        d.y = Math.max(0, d.y - d.drop * dt * 6);
        this.s3.set(0.8, 2.2, 0.8);
        if (d.y <= 0.01) {
          d.theta = 0.55 + Math.random() * 0.75;
          d.speed = 0;
          d.drop = 0;
          d.wait = 0.5 + Math.random() * 2.5;
        }
      }
      const ct = Math.cos(Math.max(d.theta, 0.05));
      this.v.set(rc * ct * Math.sin(d.phi), d.y, rc * ct * Math.cos(d.phi));
      this.m4.compose(this.v, this.q.identity(), this.s3);
      this.dripMesh.setMatrixAt(i, this.m4);
    });
    this.dripMesh.instanceMatrix.needsUpdate = true;
  }

  private spot(world: THREE.Vector3, worldSize: number): ScreenSpot {
    const dist = this.camera.position.distanceTo(world);
    const p = this.v.copy(world).project(this.camera);
    const px = (worldSize / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * dist)) * this.h;
    return { x: (p.x * 0.5 + 0.5) * this.w, y: (-p.y * 0.5 + 0.5) * this.h, s: px };
  }

  private report() {
    if (!this.onFrame) return;
    // the doorway's bounding box on screen
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const [side, y] of [
      [-0.62, 0],
      [0.62, 0],
      [-0.62, 1.0],
      [0.62, 1.0],
      [0, 1.0],
    ]) {
      const s = this.spot(this.at(0.05, y, side), 1);
      x0 = Math.min(x0, s.x);
      x1 = Math.max(x1, s.x);
      y0 = Math.min(y0, s.y);
      y1 = Math.max(y1, s.y);
    }
    const pathP = this.pathCurve.getPoint(0.55);
    this.onFrame({
      path: this.spot(pathP.setY(this.height(pathP.x, pathP.z) + 0.55), 1.2),
      door: this.spot(this.at(0.6, 0.5), 1.0),
      inside: this.spot(this.at(-0.7, 0.45), 0.4),
      out: this.spot(this.at(1.2, 0.85), 1.6),
      doorRect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
      assembled: 1 - clamp(this.liftNow, 0, 1),
    });
  }
}
  private at(along: number, y: number, side = 0) {
    return this.v2.copy(this.mouth).addScaledVector(this.D, along).addScaledVector(this.L, side).setY(y).clone();
  }

    dots.needsUpdate = true;
    const lines = this.labelLines.geometry.attributes.position as THREE.BufferAttribute;
    const pairs = this.labelLines.geometry.userData.pairs as number[];
    pairs.forEach((idx, j) => lines.setXYZ(j, dots.getX(idx), dots.getY(idx), dots.getZ(idx)));
    lines.needsUpdate = true;
  }
    this.radial.dispose();
    this.pendingStart = false;
    // Rendering before the shaders are compiled would block the main thread
    if (!this.warmed) {
      this.pendingStart = true;
      return;
    }
    this.burstClock = 0;
    this.lift.v += 9;
  private warmed = false;
  private pendingStart = false;
    pts.renderOrder = 5;
        uWind: { value: 0 },
        uFall: { value: o.fall },
        uSize: { value: o.size },
        uDensity: { value: 1 },
