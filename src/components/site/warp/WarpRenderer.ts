import * as THREE from "three";

/**
 * The warp carousel: a ring of project cards that turns in 3D. Side cards
 * spin round to show their mirrored backs, and a wide-angle lens pass
 * stretches them out to the screen edges with chromatic, cyan-rimmed flares
 * and glows tinted by the card in front.
 *
 * Cards render into an offscreen target, then one full-screen pass applies
 * the lens. When nothing is moving the loop goes idle and costs nothing.
 *
 * Colours stay in display (sRGB) space end to end: the custom shaders skip
 * Three's colour management, so canvas-drawn cards look exactly as drawn.
 */

export const CARD_W = 1;
export const CARD_H = 1.26;
const FOV = 38;
const SIDE_Z = -0.95;
const MAX_PIXELS = 2_400_000;

export type WarpCard = { canvas: HTMLCanvasElement; accent: string };

const CARD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const CARD_FRAG = /* glsl */ `
uniform sampler2D map;
uniform float uOpacity;
uniform float uRim;
uniform float uBack;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(map, vUv); // premultiplied
  // Backs read as the same card seen through glass: a touch dimmer
  if (!gl_FrontFacing) c.rgb *= uBack;
  // Thin cyan rim, brighter the further the card has turned
  vec2 d = min(vUv, 1.0 - vUv) * vec2(${CARD_W.toFixed(2)}, ${CARD_H.toFixed(2)});
  float rim = smoothstep(0.022, 0.0, min(d.x, d.y)) * uRim;
  c.rgb += vec3(0.35, 0.85, 1.0) * rim * c.a;
  gl_FragColor = c * uOpacity;
}`;

const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const POST_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform vec2 uRes;
uniform float uWarp;     // horizontal lens strength (< 0.25 keeps it monotonic)
uniform float uFlare;    // vertical flare toward the edges
uniform float uVel;      // 0..1 turning speed
uniform float uDir;      // turning direction
uniform vec3 uGlow;      // colour of the front card
uniform float uGlowAmt;
varying vec2 vUv;

// Output position -> where to sample the flat render. Near the left/right
// edges a thin strip of the side cards is spread across a wide band: the
// wide-lens flare. Its height grows too, giving the funnel shape.
vec2 lensFor(vec2 p, float k) {
  float ax = abs(p.x);
  float sx = sign(p.x) * ax * (1.0 - k * ax * ax * ax);
  float sy = p.y * (1.0 - uFlare * ax * ax * ax * ax);
  return vec2(sx, sy) * 0.5 + 0.5;
}

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float ax = abs(p.x);
  float edge = smoothstep(0.35, 1.0, ax);           // how deep into the flare
  // Both stay at zero in the middle, so the front card is pin-sharp at rest
  float ca = 0.03 * edge + 0.012 * uVel;           // chromatic spread
  float smear = 0.035 * edge * edge + 0.01 * uVel;

  vec4 acc = vec4(0.0);
  float wsum = 0.0;
  // A few taps along the stretch direction: motion-blurred, liquid edges
  for (int i = 0; i < 6; i++) {
    float t = float(i) / 5.0 - 0.5;
    float w = 1.0 - abs(t);
    vec2 q = p + vec2(t * smear * (ax > 0.0 ? sign(p.x) : 1.0) + t * uVel * 0.007 * uDir, 0.0);
    vec4 r = texture2D(tScene, lensFor(q, uWarp * (1.0 + ca)));
    vec4 g = texture2D(tScene, lensFor(q, uWarp));
    vec4 b = texture2D(tScene, lensFor(q, uWarp * (1.0 - ca)));
    acc += vec4(r.r, g.g, b.b, max(r.a, max(g.a, b.a))) * w;
    wsum += w;
  }
  vec4 col = acc / wsum;

  // Cyan rim on the cards' silhouettes: where alpha changes, not where a
  // card is merely translucent (a fading card must not turn cyan all over)
  vec2 src = lensFor(p, uWarp);
  vec2 px = (1.5 + 4.0 * edge) / uRes;
  float gx = texture2D(tScene, src + vec2(px.x, 0.0)).a - texture2D(tScene, src - vec2(px.x, 0.0)).a;
  float gy = texture2D(tScene, src + vec2(0.0, px.y)).a - texture2D(tScene, src - vec2(0.0, px.y)).a;
  float rim = clamp(length(vec2(gx, gy)) * 1.25, 0.0, 1.0) * (0.12 + 0.88 * edge);
  col.rgb += vec3(0.25, 0.86, 1.0) * rim;
  col.a = max(col.a, rim * 0.85);

  // Colour-matched glows above and below the ring
  // (squares written out: pow() is undefined for negative bases in GLSL)
  float hx = p.x / 0.42;
  float hy = (abs(p.y) - 1.0) / 0.085;
  float glow = exp(-hx * hx - hy * hy);
  float amt = glow * uGlowAmt * (0.75 + 0.5 * uVel);
  col.rgb += uGlow * amt;
  col.a = clamp(col.a + amt, 0.0, 1.0);

  gl_FragColor = col;
}`;

type CardSlot = {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  texture: THREE.CanvasTexture;
  accent: THREE.Color;
};

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

export class WarpRenderer {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 50);
  private target: THREE.WebGLRenderTarget;
  private post: THREE.ShaderMaterial;
  private postScene = new THREE.Scene();
  private postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private geometry = new THREE.PlaneGeometry(CARD_W, CARD_H);
  private cards: CardSlot[] = [];
  private glow = new THREE.Color("#38d6ff");

  // Motion state: a critically damped spring from `pos` toward `goal`
  private pos = 0;
  private goal = 0;
  private vel = 0;
  private speed = 0;

  private width = 1;
  private height = 1;
  private sideX = 1.6;
  private centerHalfNdc = 0.3;
  private quality = 1;
  private visible = false;
  private running = false;
  private raf = 0;
  private last = 0;
  private frames = 0;
  private slow = 0;
  private disposed = false;
  private reduced: boolean;

  constructor(opts: { reducedMotion?: boolean } = {}) {
    this.reduced = Boolean(opts.reducedMotion);
    this.canvas = document.createElement("canvas");
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: false, // the lens pass resamples anyway
      premultipliedAlpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(1);
    this.canvas.addEventListener("webglcontextlost", (e) => e.preventDefault());

    this.target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
    this.post = new THREE.ShaderMaterial({
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG,
      uniforms: {
        tScene: { value: this.target.texture },
        uRes: { value: new THREE.Vector2(1, 1) },
        uWarp: { value: 0.215 },
        uFlare: { value: 0.5 },
        uVel: { value: 0 },
        uDir: { value: 1 },
        uGlow: { value: this.glow.clone() },
        uGlowAmt: { value: 0.85 },
      },
      depthTest: false,
      depthWrite: false,
      transparent: true,
      premultipliedAlpha: true,
    });
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post));
  }

  /** Replaces the cards (textures are drawn by the caller). */
  setCards(cards: WarpCard[]) {
    this.clearCards();
    const aniso = this.renderer.capabilities.getMaxAnisotropy();
    this.cards = cards.map((card) => {
      const texture = new THREE.CanvasTexture(card.canvas);
      texture.colorSpace = THREE.NoColorSpace; // raw sRGB values, see header
      texture.premultiplyAlpha = true;
      texture.anisotropy = Math.min(8, aniso);
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      const material = new THREE.ShaderMaterial({
        vertexShader: CARD_VERT,
        fragmentShader: CARD_FRAG,
        uniforms: {
          map: { value: texture },
          uOpacity: { value: 1 },
          uRim: { value: 0 },
          uBack: { value: 0.82 },
        },
        side: THREE.DoubleSide,
        transparent: true,
        premultipliedAlpha: true,
        depthTest: false,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.geometry, material);
      this.scene.add(mesh);
      return { mesh, material, texture, accent: new THREE.Color(card.accent) };
    });
    this.kick();
  }

  /** Where the ring should turn to, in card units (0 = first card). */
  setTarget(index: number, immediate = false) {
    this.goal = clamp(index, 0, Math.max(0, this.cards.length - 1));
    if (immediate || this.reduced) {
      this.pos = this.goal;
      this.vel = 0;
    }
    this.kick();
  }

  get position() {
    return this.pos;
  }

  /** Half the front card's on-screen width, in normalised (-1..1) units. */
  get frontHalfWidth() {
    return this.centerHalfNdc;
  }

  setVisible(v: boolean) {
    this.visible = v;
    if (v) this.kick();
    else this.stop();
  }

  setSize(width: number, height: number) {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    const aspect = this.width / this.height;
    const tanH = Math.tan(THREE.MathUtils.degToRad(FOV / 2));

    // Fit the front card to ~54% of the height, but never wider than ~62%
    // of the width (phones), then place the side cards just past it.
    const fitH = CARD_H / 2 / (tanH * 0.54);
    const narrow = aspect < 0.9; // phones in portrait
    const fitW = CARD_W / 2 / (tanH * aspect * (narrow ? 0.52 : 0.62));
    const camZ = Math.max(fitH, fitW);
    this.camera.position.set(0, 0, camZ);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();

    const halfW0 = tanH * camZ * aspect;
    this.centerHalfNdc = CARD_W / 2 / halfW0;
    const depth = (camZ - SIDE_Z) / camZ; // world units per NDC grow with depth
    const sideHalf = (CARD_W / 2) * Math.abs(Math.cos(0.34));
    // Centre of the side card at ~70% of the half-width (pre-lens), clear of the
    // front card, but never past the screen edge, so its flare always peeks in
    this.sideX = Math.max(0.7 * halfW0 * depth, Math.min((CARD_W / 2 + 0.16) * depth + sideHalf, 0.97 * halfW0 * depth));
    // A gentler lens on narrow screens, where the front card reaches further out
    this.post.uniforms.uWarp.value = narrow ? 0.17 : 0.215;
    this.post.uniforms.uFlare.value = narrow ? 0.38 : 0.5;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.75) * this.quality;
    const scale = Math.min(dpr, Math.sqrt(MAX_PIXELS / (this.width * this.height)));
    const bw = Math.round(this.width * scale);
    const bh = Math.round(this.height * scale);
    this.renderer.setSize(bw, bh, false);
    this.target.setSize(bw, bh);
    (this.post.uniforms.uRes.value as THREE.Vector2).set(bw, bh);
    this.kick();
  }

  private layout() {
    const sideX = this.sideX;
    let best = Infinity;
    for (let i = 0; i < this.cards.length; i++) {
      const { mesh, material } = this.cards[i];
      const o = i - this.pos;
      const a = Math.abs(o);
      const s = Math.sign(o) || 1;
      const near = Math.min(a, 1);
      const far = Math.max(a - 1, 0);
      // A card slides out still facing us, then whips round to show its
      // mirrored back as it reaches the side (no empty gap mid-turn)
      const t = clamp((near - 0.3) / 0.7, 0, 1);
      const swing = t * t * (3 - 2 * t);
      mesh.position.set(s * (near * sideX + far * sideX * 0.55), 0, SIDE_Z * near - far * 0.9);
      mesh.rotation.set(0, -s * swing * (Math.PI - 0.34), 0);
      const fade = clamp(1 - (a - 1.05) / 0.7, 0, 1);
      mesh.visible = fade > 0.001;
      material.uniforms.uOpacity.value = fade;
      material.uniforms.uRim.value = Math.min(1, a * 1.4) * 0.9;
      mesh.renderOrder = -Math.round(a * 1000);
      if (a < best) best = a;
    }
    // Glow takes the colour of whichever card is in front
    const i = clamp(Math.round(this.pos), 0, this.cards.length - 1);
    const front = this.cards[i];
    if (front) {
      this.glow.lerp(front.accent.clone().lerp(new THREE.Color("#38d6ff"), 0.45), 0.12);
      (this.post.uniforms.uGlow.value as THREE.Color).copy(this.glow);
    }
  }

  private render() {
    this.layout();
    this.post.uniforms.uVel.value = this.speed;
    this.post.uniforms.uDir.value = this.vel >= 0 ? 1 : -1;
    this.renderer.setRenderTarget(this.target);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.clear();
    this.renderer.render(this.postScene, this.postCamera);
  }

  /** Starts the loop if there is something to show. */
  private kick() {
    if (this.disposed || !this.visible || !this.cards.length) return;
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.step(dt);
      this.render();
      this.watch(dt);
      // Settled: one final frame has been drawn, go idle until something changes
      const glowSettled = this.glowSettled();
      if (Math.abs(this.goal - this.pos) < 1e-4 && Math.abs(this.vel) < 1e-3 && this.speed < 1e-3 && glowSettled) {
        this.pos = this.goal;
        this.vel = 0;
        this.speed = 0;
        this.render();
        this.running = false;
        return;
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private glowSettled() {
    const i = clamp(Math.round(this.pos), 0, this.cards.length - 1);
    const front = this.cards[i];
    if (!front) return true;
    const want = front.accent.clone().lerp(new THREE.Color("#38d6ff"), 0.45);
    return Math.abs(want.r - this.glow.r) + Math.abs(want.g - this.glow.g) + Math.abs(want.b - this.glow.b) < 0.01;
  }

  private step(dt: number) {
    const w = 8.5; // spring frequency: higher = snappier
    const acc = w * w * (this.goal - this.pos) - 2 * w * this.vel;
    this.vel += acc * dt;
    this.pos += this.vel * dt;
    const want = this.reduced ? 0 : clamp(Math.abs(this.vel) * 0.42, 0, 1);
    this.speed += (want - this.speed) * (1 - Math.exp(-10 * dt));
  }

  /** Halves the resolution scale if the device is struggling. Never raises it. */
  private watch(dt: number) {
    if (dt > 0.2) return;
    this.frames++;
    if (dt > 0.024) this.slow++;
    if (this.frames < 90) return;
    if (this.slow / this.frames > 0.4 && this.quality > 0.55) {
      this.quality = Math.max(0.55, this.quality - 0.2);
      this.setSize(this.width, this.height);
    }
    this.frames = 0;
    this.slow = 0;
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private clearCards() {
    for (const c of this.cards) {
      this.scene.remove(c.mesh);
      c.material.dispose();
      c.texture.dispose();
    }
    this.cards = [];
  }

  dispose() {
    this.disposed = true;
    this.stop();
    this.clearCards();
    this.geometry.dispose();
    this.post.dispose();
    this.target.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
