import * as THREE from "three";
import { expoInOut, power3Out, power4Out, Tweener } from "./tween";

/**
 * The skills lens carousel: an endless row of category panels seen through a
 * big tilted "liquid glass" lens (dispersion, a shimmering accent ring, a
 * swirling rim). Panels render into an offscreen target; one full-screen pass
 * applies the lens.
 *
 * Units are CSS pixels (orthographic camera centred on the canvas). Colours
 * stay in display (sRGB) space end to end: the custom shaders skip Three's
 * colour management, so the canvas-drawn panels look exactly as drawn.
 */

const MAX_PIXELS = 2_400_000;
const EASE = 0.09;
const SNAP_EASE = 0.05;
const WHEEL = 1.4;
const DRAG = 1.6;
const FRICTION = 0.865;
const SNAP_IDLE = 120; // ms
const MAX_SAMPLES = 16;

/** The lens at rest (the reference's tuned values). */
const LENS = {
  sizeX: 0.565,
  sizeY: 1,
  rotation: (65 * Math.PI) / 180,
  zoom: 0.35,
  dispersion: 11,
  glow: 4.2,
  whiteGlow: 0.24,
  novaSize: 12,
  blueRing: 6,
  ringRadius: 0.49,
  ringWidth: 0.014,
  shimmerFreq: 12,
  shimmerSpeed: 3.5,
  shimmerDepth: 0.12,
  rimStart: 0.578,
  rimTangential: 0.6,
  rimInward: 0,
  rimFreq1: 2,
  rimFreq2: 1,
  rimLine: 1.4,
  rimLinePos: 0.488,
  rimLineWidth: 0.003,
};

const PANEL_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const PANEL_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D map;
uniform vec2 uSize;     // on-screen size, px
uniform float uRadius;  // corner radius, px
uniform float uCrop;    // 0..1 visible height (entry reveal)
uniform float uAlpha;
uniform float uPx;      // device pixels per CSS px
varying vec2 vUv;
float sdRoundBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r; }
void main() {
  vec2 p = (vUv - 0.5) * uSize;
  float r = min(uRadius, min(uSize.x, uSize.y) * 0.5);
  float d = sdRoundBox(p, uSize * 0.5, r);
  float a = clamp(0.5 - d * uPx, 0.0, 1.0) * uAlpha;
  vec2 uv = vec2(vUv.x, 0.5 + (vUv.y - 0.5) * uCrop);
  vec3 c = texture2D(map, uv).rgb;
  gl_FragColor = vec4(c * a, a);
}`;

const LENS_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

/*
 * The reference lens, with two changes: the scene texture is premultiplied
 * panels over transparency, composited onto the page background (uBg) per
 * sample; and in the light theme the glow terms tint toward their colour
 * instead of adding light (adding to white would make them vanish).
 */
const LENS_FRAG = /* glsl */ `
#define PI 3.14159265
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex; uniform vec3 uBg; uniform float uLight; uniform vec3 uInk;
uniform vec2 uCenter; uniform float uSizeX; uniform float uSizeY; uniform float uAspect; uniform float uZoom;
uniform float uDispersion; uniform float uGlow; uniform float uWhiteGlow; uniform float uNovaSize;
uniform float uBlueRing; uniform float uRingRadius; uniform float uRingWidth;
uniform float uShimmer; uniform float uShimmerFreq; uniform float uShimmerSpeed; uniform float uShimmerDepth; uniform float uTime;
uniform float uRimStart; uniform float uRimTangential; uniform float uRimInward; uniform float uRimFreq1; uniform float uRimFreq2;
uniform vec3 uBlueColor; uniform float uRimLine; uniform float uRimLinePos; uniform float uRimLineWidth;
uniform float uShape; uniform float uSquareRound; uniform float uRotation; uniform int uSamples; uniform float uFx;
const int MAX_SAMPLES = ${MAX_SAMPLES};

// pow() is undefined for negative bases in GLSL: square by hand
float sq(float x) { return x * x; }
vec3 scene(vec2 uv) { vec4 t = texture2D(uTex, uv); return t.rgb + uBg * (1.0 - t.a); }
float sdRoundBox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r; }

vec3 discLens(vec2 center, float aspectCorrect, out float outA) {
  vec2 p = (vUv - center); p.x *= aspectCorrect;
  float ca = cos(uRotation), sa = sin(uRotation); p = mat2(ca, -sa, sa, ca) * p;
  vec2 halfSize = vec2(uSizeX, uSizeY); float dist = length(p / halfSize); outA = 0.0;
  float maskND;
  if (uShape > 0.5) { float corner = min(uSizeX, uSizeY) * clamp(uSquareRound, 0.0, 1.0); float sd = sdRoundBox(p, halfSize, corner); maskND = 1.0 + sd / min(uSizeX, uSizeY); } else { maskND = dist; }
  if (maskND > 1.0) return vec3(0.0);
  float shapeND = clamp(maskND, 0.0, 1.0); float nd = clamp(dist, 0.0, 1.0);
  vec2 offset = vUv - center; vec2 radialDir = normalize(offset + 1e-6); vec2 tangentDir = vec2(-radialDir.y, radialDir.x); float angle = atan(p.y, p.x);
  float pull = uZoom * 0.30 * (nd * nd); float rimStrength = smoothstep(uRimStart, 1.0, nd);
  float fluidWave = sin(angle * uRimFreq1) * 0.55 + sin(angle * uRimFreq2) * 0.25; float rScreen = (uSizeX + uSizeY) * 0.5;
  vec2 rimOff = tangentDir * fluidWave * rimStrength * rScreen * uRimTangential; vec2 rimPull = -radialDir * rimStrength * rScreen * uRimInward;
  vec2 baseUV = center + offset * (1.0 - pull) + rimOff + rimPull;
  float rimMask = smoothstep(0.55, 1.0, nd); vec2 dispDir = offset * uDispersion * 0.004 * rimMask;
  int N = uSamples; if (N < 2) N = 2; if (N > MAX_SAMPLES) N = MAX_SAMPLES;
  vec3 col = vec3(0.0); vec3 caW = vec3(0.0);
  for (int i = 0; i < MAX_SAMPLES; i++) {
    if (i >= N) break;
    float t = float(i) / float(N - 1); vec2 sUV = baseUV + dispDir * (t - 0.5); vec3 s = scene(sUV);
    vec3 w = vec3(exp(-sq((t - 0.00) / 0.38)), exp(-sq((t - 0.50) / 0.38)), exp(-sq((t - 1.00) / 0.38)));
    col += s * w; caW += w;
  }
  col /= max(caW, vec3(0.001));
  col *= mix(mix(0.91, 0.97, uLight), 1.0, smoothstep(0.0, 0.38, shapeND)) * uFx + (1.0 - uFx);
  float r2 = shapeND * shapeND * 0.25; float gs = max(uNovaSize * uGlow * 0.003, 0.004);
  float nova = exp(-r2 / gs) + exp(-r2 / (gs * 7.0)) * 0.18; nova *= uWhiteGlow * (uGlow / 17.0) * 1.15;
  float dC = shapeND * 0.5; float tR = clamp(uRingRadius, 0.1, 0.49); float rW = max(uRingWidth, 0.003);
  float ring = exp(-sq((dC - tR) / rW)); ring *= uBlueRing * (uGlow / 17.0) * 1.8;
  if (uShimmer > 0.5) ring *= sin(angle * uShimmerFreq + uTime * uShimmerSpeed) * uShimmerDepth + (1.0 - uShimmerDepth);
  float ringAura = exp(-sq((dC - tR) / (rW * 6.0))) * 0.28 * uBlueRing * (uGlow / 17.0);
  float rimLine = exp(-sq((dC - uRimLinePos) / max(uRimLineWidth, 0.0001))) * uRimLine;
  // Dark: light is added. Light: the same terms tint toward their colour.
  vec3 dark = col + vec3(nova) + uBlueColor * (ring + ringAura) + vec3(rimLine);
  vec3 light = mix(col, uBlueColor, clamp((ring + ringAura) * 0.55, 0.0, 0.9));
  light = mix(light, uInk, clamp(rimLine * 0.22, 0.0, 0.5));
  light += vec3(nova * 0.35);
  col = mix(dark, light, uLight);
  outA = smoothstep(1.0, 0.93, maskND); return col;
}
void main(){
  vec3 base = scene(vUv); float a = 0.0;
  vec3 c = discLens(uCenter, uAspect, a);
  // The lens is bigger than the stage: melt it out toward the stage's top and
  // bottom (and sides) so it never ends in a hard, cut-off edge
  a *= smoothstep(0.0, 0.17, vUv.y) * smoothstep(1.0, 0.83, vUv.y) * smoothstep(0.0, 0.05, vUv.x) * smoothstep(1.0, 0.95, vUv.x);
  gl_FragColor = vec4(mix(base, c, a), 1.0);
}`;

type PanelState = { y: number; dx: number; crop: number; scale: number; alpha: number };
type Slot = { mesh: THREE.Mesh; material: THREE.ShaderMaterial; state: PanelState; x: number };

export type HitResult = { k: number; category: number; centered: boolean };
export type LensColors = { bg: [number, number, number]; ring: [number, number, number]; ink: [number, number, number]; light: boolean; bgCss: string };

const mod = (a: number, n: number) => ((a % n) + n) % n;
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
/** Frame-rate independent version of `x += (goal - x) * k` per 60 Hz frame. */
const ease = (k: number, dt: number) => 1 - Math.pow(1 - k, dt * 60);

export class LensRenderer {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
  private target: THREE.WebGLRenderTarget;
  private lens: THREE.ShaderMaterial;
  private lensScene = new THREE.Scene();
  private lensCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private geometry = new THREE.PlaneGeometry(1, 1);
  private textures: THREE.CanvasTexture[] = [];
  private slots: Slot[] = [];
  private tw = new Tweener();
  private bg = new THREE.Color("#ffffff");

  // Layout (CSS px)
  private w = 1;
  private h = 1;
  private panelW = 1;
  private panelH = 1;
  private slot = 1;
  private total = 1;
  private narrow = false;
  private aspect: number;
  private px = 1;

  // Motion
  private scroll = 0;
  private goal = 0;
  private momentum = 0;
  private dragVel = 0;
  private lastMove = 0;
  private lastInput = -1e9;
  private dragging = false;
  private snapping = false;
  private energy = 0;
  private prevScroll = 0;
  private fx = { v: 0 };
  private time = 0;

  private entry: "pending" | "running" | "done" = "pending";
  private focusK = -1;
  private activeIndex = -1;

  private samples: number;
  private quality = 1;
  private visible = false;
  private running = false;
  private raf = 0;
  private last = 0;
  private frames = 0;
  private slow = 0;
  private disposed = false;

  onActive?: (i: number) => void;
  onEntryDone?: () => void;
  onFocusChange?: (focused: boolean) => void;
  onContextLost?: () => void;

  constructor(opts: { aspect: number; samples?: number }) {
    this.aspect = opts.aspect;
    this.samples = opts.samples ?? MAX_SAMPLES;
    this.canvas = document.createElement("canvas");
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: false,
      antialias: false, // the lens pass resamples anyway; panel edges are AA'd in the shader
      powerPreference: "high-performance",
    });
    this.renderer.autoClear = false;
    this.renderer.setPixelRatio(1);
    this.canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.stop();
      this.onContextLost?.();
    });

    this.target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
    const u = <T>(value: T) => ({ value });
    this.lens = new THREE.ShaderMaterial({
      vertexShader: LENS_VERT,
      fragmentShader: LENS_FRAG,
      uniforms: {
        uTex: u(this.target.texture),
        uBg: u(new THREE.Vector3(1, 1, 1)),
        uInk: u(new THREE.Vector3(0, 0, 0)),
        uLight: u(1),
        uCenter: u(new THREE.Vector2(0.5, 0.5)),
        uAspect: u(1),
        uSizeX: u(LENS.sizeX),
        uSizeY: u(LENS.sizeY),
        uRotation: u(LENS.rotation),
        uZoom: u(0),
        uDispersion: u(0),
        uGlow: u(LENS.glow),
        uWhiteGlow: u(0),
        uNovaSize: u(LENS.novaSize),
        uBlueRing: u(0),
        uRingRadius: u(LENS.ringRadius),
        uRingWidth: u(LENS.ringWidth),
        uShimmer: u(1),
        uShimmerFreq: u(LENS.shimmerFreq),
        uShimmerSpeed: u(LENS.shimmerSpeed),
        uShimmerDepth: u(LENS.shimmerDepth),
        uTime: u(0),
        uRimStart: u(LENS.rimStart),
        uRimTangential: u(0),
        uRimInward: u(LENS.rimInward),
        uRimFreq1: u(LENS.rimFreq1),
        uRimFreq2: u(LENS.rimFreq2),
        uBlueColor: u(new THREE.Vector3(0, 0.62, 1)),
        uRimLine: u(0),
        uRimLinePos: u(LENS.rimLinePos),
        uRimLineWidth: u(LENS.rimLineWidth),
        uShape: u(0),
        uSquareRound: u(0),
        uSamples: u(this.samples),
        uFx: u(0),
      },
      depthTest: false,
      depthWrite: false,
    });
    this.lensScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.lens));
  }

  /** One canvas per category (drawn by the caller). */
  setPanels(canvases: HTMLCanvasElement[]) {
    for (const t of this.textures) t.dispose();
    const aniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.textures = canvases.map((c) => {
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.NoColorSpace; // raw sRGB values, see header
      t.anisotropy = aniso;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      return t;
    });
    this.rebuild();
  }

  /** Call after redrawing the panel canvases (e.g. a theme change). */
  refreshTextures() {
    for (const t of this.textures) t.needsUpdate = true;
    this.renderOnce();
  }

  setColors(c: LensColors) {
    const un = this.lens.uniforms;
    (un.uBg.value as THREE.Vector3).set(...c.bg);
    (un.uBlueColor.value as THREE.Vector3).set(...c.ring);
    (un.uInk.value as THREE.Vector3).set(...c.ink);
    un.uLight.value = c.light ? 1 : 0;
    this.bg.set(c.bgCss);
    this.renderOnce();
  }

  setSize(width: number, height: number) {
    this.w = Math.max(1, Math.round(width));
    this.h = Math.max(1, Math.round(height));
    this.narrow = this.w < 700;
    // Panels: ~60% of the stage height, never wider than ~72% of a phone
    let ph = this.h * (this.narrow ? 0.62 : 0.6);
    if (ph * this.aspect > this.w * 0.72) ph = (this.w * 0.72) / this.aspect;
    this.panelH = ph;
    this.panelW = ph * this.aspect;
    this.slot = this.panelW + Math.max(24, this.panelW * (this.narrow ? 0.1 : 0.14));

    const cam = this.camera;
    cam.left = -this.w / 2;
    cam.right = this.w / 2;
    cam.top = this.h / 2;
    cam.bottom = -this.h / 2;
    cam.updateProjectionMatrix();

    const un = this.lens.uniforms;
    un.uAspect.value = this.w / this.h;
    // The lens is sized in stage heights. On portrait screens the tilted
    // ellipse would put the centre panel in the swirling rim, so it stands
    // nearly upright and wraps the panel instead.
    const ar = this.w / this.h;
    if (ar < 1) {
      un.uSizeX.value = clamp(ar * 0.7, 0.3, 0.6);
      un.uSizeY.value = 0.7;
      un.uRotation.value = (10 * Math.PI) / 180;
    } else {
      const s = clamp(ar / 1.9, 0.75, 1);
      un.uSizeX.value = LENS.sizeX * s;
      un.uSizeY.value = LENS.sizeY * s;
      un.uRotation.value = LENS.rotation;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 1.75) * this.quality;
    const scale = Math.min(dpr, Math.sqrt(MAX_PIXELS / (this.w * this.h)));
    this.px = scale;
    const bw = Math.round(this.w * scale);
    const bh = Math.round(this.h * scale);
    this.renderer.setSize(bw, bh, false);
    this.target.setSize(bw, bh);
    this.rebuild();
  }

  /** (Re)creates the pool so the row always covers the screen plus a margin. */
  private rebuild() {
    const n = this.textures.length;
    if (!n) return;
    const repeats = Math.max(4, Math.ceil((this.w + this.slot * 3) / (n * this.slot)));
    const count = repeats * n;
    // Keep the same place in the row across a slot-size change
    const ratio = this.slotPrev ? this.slot / this.slotPrev : 1;
    this.slotPrev = this.slot;
    this.goal *= ratio;
    this.scroll *= ratio;
    this.prevScroll *= ratio;
    this.total = count * this.slot;

    if (this.slots.length !== count) {
      if (this.focusK >= 0) this.endFocus(true);
      for (const s of this.slots) {
        this.scene.remove(s.mesh);
        s.material.dispose();
      }
      const pending = this.entry === "pending";
      this.slots = Array.from({ length: count }, (_, k) => {
        const material = new THREE.ShaderMaterial({
          vertexShader: PANEL_VERT,
          fragmentShader: PANEL_FRAG,
          uniforms: {
            map: { value: this.textures[k % n] },
            uSize: { value: new THREE.Vector2(1, 1) },
            uRadius: { value: 20 },
            uCrop: { value: 1 },
            uAlpha: { value: 1 },
            uPx: { value: 1 },
          },
          transparent: true,
          premultipliedAlpha: true,
          depthTest: false,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(this.geometry, material);
        this.scene.add(mesh);
        const state: PanelState = pending
          ? { y: -0.9 * this.h, dx: 0, crop: Math.min(1, 80 / this.panelH), scale: 1, alpha: 1 }
          : { y: 0, dx: 0, crop: 1, scale: 1, alpha: 1 };
        return { mesh, material, state, x: 0 };
      });
    } else {
      this.slots.forEach((s, k) => (s.material.uniforms.map.value = this.textures[k % n]));
    }
    this.warm();
    this.renderOnce();
  }
  private slotPrev = 0;

  /**
   * Draws every pooled panel once, offscreen, so the first drag doesn't pay
   * for setting up the panels that were never on screen yet.
   */
  private warm() {
    if (this.disposed) return;
    for (const s of this.slots) {
      s.mesh.visible = true;
      s.mesh.position.set(0, 0, 0);
      s.mesh.scale.set(1, 1, 1);
    }
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
  }

  // ---------------------------------------------------------------- input

  get locked() {
    return this.entry !== "done";
  }
  get focused() {
    return this.focusK >= 0;
  }

  wheel(delta: number) {
    if (this.locked || this.focused) return;
    this.goal += delta * WHEEL;
    this.snapping = false;
    this.momentum = 0;
    this.lastInput = performance.now();
    this.kick();
  }

  dragStart() {
    if (this.locked || this.focused) return false;
    this.dragging = true;
    this.snapping = false;
    this.momentum = 0;
    this.dragVel = 0;
    this.lastMove = performance.now();
    this.kick();
    return true;
  }

  dragMove(dx: number) {
    if (!this.dragging) return;
    const now = performance.now();
    const d = -dx * DRAG;
    this.goal += d;
    // Track velocity in px per 60 Hz frame, lightly smoothed
    const frames = Math.max(1, (now - this.lastMove) / 16.67);
    this.dragVel = this.dragVel * 0.6 + (d / frames) * 0.4;
    this.lastMove = now;
    this.lastInput = now;
  }

  dragEnd() {
    if (!this.dragging) return;
    this.dragging = false;
    const now = performance.now();
    this.momentum = now - this.lastMove > 90 ? 0 : clamp(this.dragVel, -90, 90);
    this.lastInput = now;
    this.kick();
  }

  /** Moves one panel left (-1) or right (+1). */
  step(dir: number) {
    if (this.locked || this.focused) return;
    this.goal = (Math.round(this.goal / this.slot) + dir) * this.slot;
    this.snapping = false;
    this.momentum = 0;
    this.lastInput = -1e9;
    this.kick();
  }

  /** Hit-test in canvas CSS px (top-left origin). */
  hit(cx: number, cy: number): HitResult | null {
    const x = cx - this.w / 2;
    const y = this.h / 2 - cy;
    const n = this.textures.length;
    for (let k = 0; k < this.slots.length; k++) {
      const s = this.slots[k];
      if (!s.mesh.visible || s.state.alpha < 0.5) continue;
      const m = s.mesh;
      if (Math.abs(x - m.position.x) <= m.scale.x / 2 && Math.abs(y - m.position.y) <= m.scale.y / 2) {
        const centered = this.focusK === k || (Math.abs(s.x) < this.slot * 0.25 && Math.abs(this.goal - this.scroll) < this.slot * 0.25);
        return { k, category: k % n, centered };
      }
    }
    return null;
  }

  /** Slides pool panel `k` to the centre. */
  centerOn(k: number) {
    if (this.locked || this.focused) return;
    const x = mod(k * this.slot - this.goal + this.total / 2, this.total) - this.total / 2;
    this.goal = Math.round((this.goal + x) / this.slot) * this.slot;
    this.snapping = false;
    this.momentum = 0;
    this.lastInput = -1e9;
    this.kick();
  }

  /** The pool index of the panel nearest the centre. */
  private centerK() {
    let best = -1;
    let bestX = Infinity;
    this.slots.forEach((s, k) => {
      const x = Math.abs(mod(k * this.slot - this.goal + this.total / 2, this.total) - this.total / 2);
      if (x < bestX) {
        bestX = x;
        best = k;
      }
    });
    return best;
  }

  /**
   * Where the focused panel and its detail list sit (CSS px, top-left origin).
   * Side by side when there is room; otherwise the panel lifts to the top and
   * the list becomes a sheet below it.
   */
  focusLayout() {
    const GAP = 40;
    const sideScale = Math.min(1.18, (this.h * 0.84) / this.panelH);
    const spw = this.panelW * sideScale;
    const listW = Math.min(380, this.w - spw - GAP - 48);
    const sheet = this.narrow || listW < 300;
    let scale: number, dx: number, dy: number;
    if (!sheet) {
      scale = sideScale;
      const left = (this.w - (spw + GAP + listW)) / 2;
      dx = left + spw / 2 - this.w / 2;
      dy = 0;
    } else {
      scale = Math.min(1, (this.h * 0.42 - 16) / this.panelH);
      dx = 0;
      dy = this.h / 2 - 16 - (this.panelH * scale) / 2; // up (world y)
    }
    const pw = this.panelW * scale;
    const ph = this.panelH * scale;
    const left = this.w / 2 + dx - pw / 2;
    const top = this.h / 2 - dy - ph / 2;
    return { sheet, scale, dx, dy, left, right: left + pw, top, bottom: top + ph, listW };
  }

  focus() {
    if (this.locked || this.focused || this.dragging) return;
    const k = this.centerK();
    if (k < 0) return;
    this.goal = this.scroll = Math.round(this.goal / this.slot) * this.slot;
    this.momentum = 0;
    this.focusK = k;
    this.layoutX();
    const others = this.slots
      .map((s, j) => ({ s, j, d: Math.abs(s.x) }))
      .filter((o) => o.j !== k)
      .sort((a, b) => a.d - b.d);
    others.forEach(({ s }, rank) => {
      const vis = Math.abs(s.x) < this.w / 2 + this.slot;
      this.tw.to(s.state, { y: -1.4 * this.panelH, alpha: 0 }, { duration: 0.7, delay: vis ? Math.min(rank, 8) * 0.06 : 0, ease: power4Out });
    });
    const f = this.slots[k].state;
    const fl = this.focusLayout();
    this.tw.to(f, { scale: fl.scale, dx: fl.dx, y: fl.dy }, { duration: 0.9, ease: power3Out });
    this.tw.to(this.fx, { v: 0 }, { duration: 0.85, ease: power3Out });
    this.onFocusChange?.(true);
    this.kick();
  }

  unfocus() {
    if (!this.focused) return;
    this.endFocus(false);
  }

  private endFocus(immediate: boolean) {
    const k = this.focusK;
    this.focusK = -1;
    const others = this.slots
      .map((s, j) => ({ s, j, d: Math.abs(s.x) }))
      .filter((o) => o.j !== k)
      .sort((a, b) => b.d - a.d);
    const visible = others.filter((o) => o.d < this.w / 2 + this.slot).length;
    others.forEach(({ s, d }, rank) => {
      const vis = d < this.w / 2 + this.slot;
      if (immediate) Object.assign(s.state, { y: 0, alpha: 1 });
      else
        this.tw.to(s.state, { y: 0, alpha: 1 }, { duration: 0.7, delay: vis ? Math.max(0, rank - (others.length - visible)) * 0.06 : 0, ease: power4Out });
    });
    const f = this.slots[k]?.state;
    if (f) {
      if (immediate) Object.assign(f, { scale: 1, dx: 0, y: 0 });
      else this.tw.to(f, { scale: 1, dx: 0, y: 0 }, { duration: 0.9, ease: power3Out });
    }
    if (immediate) this.fx.v = 1;
    else this.tw.to(this.fx, { v: 1 }, { duration: 0.85, ease: power3Out });
    this.onFocusChange?.(false);
    this.kick();
  }

  // ---------------------------------------------------------------- entry

  /** Plays the entry once (rise, then grow from the outside in, lens blooms). */
  playEntry() {
    if (this.entry !== "pending" || !this.slots.length) return;
    this.entry = "running";
    this.layoutX();
    const vis = this.slots.filter((s) => Math.abs(s.x) < this.w / 2 + this.slot);
    const rise = 1.0;
    const maxStagger = 0.07 * vis.length;
    const start = 0.5;
    for (const s of this.slots) {
      this.tw.to(s.state, { y: 0 }, { duration: rise, delay: start + Math.random() * maxStagger, ease: power3Out });
    }
    const growAt = start + rise + maxStagger + 0.25;
    const byDist = [...this.slots].sort((a, b) => Math.abs(b.x) - Math.abs(a.x));
    const offscreen = byDist.length - vis.length;
    let last = 0;
    byDist.forEach((s, rank) => {
      const delay = growAt + Math.max(0, rank - offscreen) * 0.085;
      last = Math.max(last, delay);
      this.tw.to(s.state, { crop: 1 }, { duration: 2.15, delay, ease: expoInOut });
    });
    this.tw.to(this.fx, { v: 1 }, { duration: 1.4, delay: growAt + 0.4, ease: power3Out });
    this.tw.call(last + 2.15, () => {
      this.entry = "done";
      this.onEntryDone?.();
    });
    this.kick();
  }

  /** Jumps straight to the resting state (no entry). */
  skipEntry() {
    this.entry = "done";
    for (const s of this.slots) Object.assign(s.state, { y: 0, crop: 1 });
    this.fx.v = 1;
    this.onEntryDone?.();
    this.kick();
  }

  // ---------------------------------------------------------------- loop

  setVisible(v: boolean) {
    this.visible = v;
    if (v) this.kick();
    else this.stop();
  }

  private kick() {
    if (this.disposed || !this.visible || !this.slots.length || this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.update(dt, now);
      this.render();
      this.watch(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Draws a frame now, without starting the loop (e.g. while paused). */
  private renderOnce() {
    if (this.disposed || !this.slots.length) return;
    if (this.running) return;
    this.layoutX();
    this.render();
  }

  private update(dt: number, now: number) {
    this.time += dt;
    this.tw.update(dt);

    if (!this.focused) {
      if (this.momentum) {
        this.goal += this.momentum * dt * 60;
        this.momentum *= Math.pow(FRICTION, dt * 60);
        if (Math.abs(this.momentum) < 0.4) this.momentum = 0;
        this.lastInput = now;
      }
      // Idle for a moment: settle on the nearest panel, a little softer
      if (!this.dragging && !this.momentum && now - this.lastInput > SNAP_IDLE) {
        const snap = Math.round(this.goal / this.slot) * this.slot;
        if (snap !== this.goal) {
          this.goal = snap;
          this.snapping = true;
        }
      }
      this.scroll += (this.goal - this.scroll) * ease(this.snapping ? SNAP_EASE : EASE, dt);
      if (Math.abs(this.goal - this.scroll) < 0.01) this.scroll = this.goal;
    }

    // Scroll energy squeezes the panels a little (fast attack, slow decay)
    const speed = dt > 0 ? Math.abs(this.scroll - this.prevScroll) / (dt * 60) : 0;
    this.prevScroll = this.scroll;
    const want = clamp(speed / 45, 0, 1);
    this.energy += (want - this.energy) * ease(want > this.energy ? 0.25 : 0.06, dt);

    const n = this.textures.length;
    const i = mod(Math.round(this.scroll / this.slot), n);
    if (i !== this.activeIndex) {
      this.activeIndex = i;
      this.onActive?.(i);
    }
  }

  private layoutX() {
    for (let k = 0; k < this.slots.length; k++) {
      this.slots[k].x = mod(k * this.slot - this.scroll + this.total / 2, this.total) - this.total / 2;
    }
  }

  private layout() {
    this.layoutX();
    const squeeze = 1 - 0.25 * this.energy;
    for (let k = 0; k < this.slots.length; k++) {
      const { mesh, material, state: st, x } = this.slots[k];
      const s = st.scale * (k === this.focusK ? 1 : squeeze);
      const pw = this.panelW * s;
      const ph = this.panelH * s * st.crop;
      mesh.position.set(x + st.dx, st.y, 0);
      mesh.scale.set(pw, ph, 1);
      mesh.visible = st.alpha > 0.002 && Math.abs(x + st.dx) < this.w / 2 + pw && Math.abs(st.y) < this.h / 2 + ph;
      mesh.renderOrder = k === this.focusK ? 1 : 0;
      const u = material.uniforms;
      (u.uSize.value as THREE.Vector2).set(pw, ph);
      u.uCrop.value = st.crop;
      u.uAlpha.value = st.alpha;
      u.uRadius.value = Math.min(28, this.panelW * 0.07) * s * Math.min(1, 0.35 + st.crop);
      u.uPx.value = this.px;
    }
  }

  private render() {
    this.layout();
    const un = this.lens.uniforms;
    const f = this.fx.v;
    un.uFx.value = f;
    un.uTime.value = this.time;
    un.uZoom.value = LENS.zoom * f;
    un.uDispersion.value = LENS.dispersion * f;
    un.uWhiteGlow.value = LENS.whiteGlow * f;
    un.uBlueRing.value = LENS.blueRing * f;
    un.uRimTangential.value = LENS.rimTangential * f;
    un.uRimInward.value = LENS.rimInward * f;
    un.uRimLine.value = LENS.rimLine * f;
    un.uSamples.value = f > 0.01 ? this.samples : 2;

    const r = this.renderer;
    r.setRenderTarget(this.target);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(this.scene, this.camera);
    r.setRenderTarget(null);
    r.setClearColor(this.bg, 1); // the page background, for any frame before the lens pass
    r.clear();
    r.render(this.lensScene, this.lensCamera);
  }

  /** Lowers the resolution scale if the device is struggling. Never raises it. */
  private watch(dt: number) {
    if (dt > 0.2) return;
    this.frames++;
    if (dt > 0.024) this.slow++;
    if (this.frames < 90) return;
    if (this.slow / this.frames > 0.4 && this.quality > 0.55) {
      this.quality = Math.max(0.55, this.quality - 0.2);
      if (this.samples > 8) this.samples = Math.max(8, this.samples - 4);
      this.setSize(this.w, this.h);
    }
    this.frames = 0;
    this.slow = 0;
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  dispose() {
    this.disposed = true;
    this.stop();
    this.tw.clear();
    for (const s of this.slots) {
      this.scene.remove(s.mesh);
      s.material.dispose();
    }
    this.slots = [];
    for (const t of this.textures) t.dispose();
    this.textures = [];
    this.geometry.dispose();
    this.lens.dispose();
    this.target.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
