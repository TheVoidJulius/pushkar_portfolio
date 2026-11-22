import * as THREE from "three";
import type { OutfitId } from "./outfits";

/**
 * Dresses one MomoRenderer. Nothing exists until an outfit other than Chrome
 * is worn; each look (skin material + accessory meshes) is built once, on
 * first use, then compiled in the background before it is shown, so switching
 * never stalls a frame and switching back reuses the compiled programs.
 * Adds no per-frame work: wearing a look only swaps materials and visibility.
 */

// Body proportions from MomoRenderer (the puffball is a scaled unit sphere)
const SX = 1.02;
const SY = 0.96;
const SZ = 0.98;
const surfZ = (x: number, y: number) => SZ * Math.sqrt(Math.max(0, 1 - (x / SX) ** 2 - (y / SY) ** 2));

type Look = { skin: THREE.Material; root: THREE.Group; ready: boolean };
type Disposable = { dispose: () => void };

/** A fresnel rim glow (the Hacker's neon edge), baked into the shader as constants. */
function addRim(material: THREE.MeshStandardMaterial, color: string, strength: number, power: number) {
  const c = new THREE.Color(color);
  const vec = `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
  const key = `mikuro-rim-${color}-${strength}-${power}`;
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
      {
        float ndv = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
        totalEmissiveRadiance += ${vec} * (${strength.toFixed(3)} * pow(1.0 - ndv, ${power.toFixed(3)}));
      }`,
    );
  };
  material.customProgramCacheKey = () => key;
  return material;
}

export class Wardrobe {
  private looks = new Map<OutfitId, Look>();
  private skinned: THREE.Mesh[] = [];
  private owned: Disposable[] = [];
  private want: OutfitId = "chrome";
  private disposed = false;

  constructor(
    private head: THREE.Group,
    private chrome: THREE.Material,
  ) {
    head.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material === chrome) this.skinned.push(m);
    });
  }

  /**
   * Puts on a look. With `compile`, a new look compiles first and the current
   * one stays on until it is ready; without (before the renderer's first
   * compile), it is swapped in at once and compiled with everything else.
   */
  wear(id: OutfitId, compile: ((o: THREE.Object3D) => Promise<unknown>) | null, onWorn: () => void) {
    if (this.disposed) return;
    this.want = id;
    const look = this.look(id);
    if (look.ready || !compile) {
      look.ready = true;
      this.apply(id);
      onWorn();
      return;
    }
    void compile(look.root)
      .catch(() => {})
      .then(() => {
        if (this.disposed) return;
        look.ready = true;
        if (this.want !== id) return;
        this.apply(id);
        onWorn();
      });
  }

  dispose() {
    this.disposed = true;
    for (const m of this.skinned) m.material = this.chrome; // the renderer disposes chrome itself
    for (const { root } of this.looks.values()) root.removeFromParent();
    for (const d of this.owned) d.dispose();
    this.owned = [];
    this.looks.clear();
  }

  private apply(id: OutfitId) {
    const look = this.looks.get(id);
    if (!look) return;
    for (const m of this.skinned) m.material = look.skin;
    for (const [lid, l] of this.looks) l.root.visible = lid === id;
  }

  private look(id: OutfitId): Look {
    let look = this.looks.get(id);
    if (look) return look;
    const root = new THREE.Group();
    root.name = `outfit-${id}`;
    root.visible = false;
    const skin = id === "hacker" ? this.hacker(root) : id === "royal" ? this.royal(root) : id === "winter" ? this.winter(root) : this.chrome;
    // A never-drawn stand-in so the skin's shader compiles with this look
    if (skin !== this.chrome || id === "chrome") {
      const proxy = new THREE.Mesh(this.skinned[0]?.geometry ?? new THREE.SphereGeometry(1, 8, 6), skin);
      proxy.visible = false;
      root.add(proxy);
    }
    this.head.add(root);
    // Chrome was compiled with the rest of Mikuro
    look = { skin, root, ready: id === "chrome" && this.skinned[0]?.material === this.chrome };
    this.looks.set(id, look);
    return look;
  }

  private own<T extends Disposable>(d: T): T {
    this.owned.push(d);
    return d;
  }

  /** Horizontal stripes as a tiny repeating texture (knit ribs, scarf bands). */
  private stripes(colors: string[], repeat: number) {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const w = canvas.width / colors.length;
      colors.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.fillRect(Math.round(i * w), 0, Math.ceil(w), 1);
      });
    }
    const tex = this.own(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat, 1);
    return tex;
  }

  // -------------------------------------------------------------------
  // Looks
  // -------------------------------------------------------------------

  /** Chrome skin + red knit beanie (ears poke through) + striped scarf. */
  private winter(root: THREE.Group) {
    const knit = this.own(
      new THREE.MeshStandardMaterial({ color: "#ffffff", map: this.stripes(["#d8343f", "#b8242f"], 28), roughness: 0.92, metalness: 0 }),
    );
    const cream = this.own(
      new THREE.MeshStandardMaterial({ color: "#ffffff", map: this.stripes(["#f6ecd9", "#e2d3b8"], 40), roughness: 0.95, metalness: 0 }),
    );
    const scarfMat = this.own(
      new THREE.MeshStandardMaterial({
        color: "#ffffff",
        map: this.stripes(["#d8343f", "#d8343f", "#f6ecd9", "#d8343f", "#d8343f", "#f6ecd9"], 6),
        roughness: 0.9,
        metalness: 0,
      }),
    );

    const beanie = new THREE.Group();
    const CAP = 1.0; // polar angle where the cap ends
    const capGeo = this.own(new THREE.SphereGeometry(1, 48, 20, 0, Math.PI * 2, 0, CAP));
    const cap = new THREE.Mesh(capGeo, knit);
    cap.scale.set(SX * 1.06, SY * 1.08, SZ * 1.06);
    const brimGeo = this.own(new THREE.TorusGeometry(1, 0.11, 12, 64));
    const brim = new THREE.Mesh(brimGeo, cream);
    brim.rotation.x = Math.PI / 2;
    brim.position.y = SY * 1.08 * Math.cos(CAP);
    brim.scale.set(SX * 1.07 * Math.sin(CAP), SZ * 1.07 * Math.sin(CAP), 1);
    const pom = new THREE.Mesh(this.own(new THREE.IcosahedronGeometry(0.17, 2)), cream);
    pom.position.set(0, SY * 1.08 + 0.1, -0.08);
    beanie.add(cap, brim, pom);
    beanie.rotation.x = -0.2; // tipped back: the brim clears the eyes
    beanie.position.y = 0.02;

    const scarf = new THREE.Group();
    const wrap = new THREE.Mesh(this.own(new THREE.TorusGeometry(0.66, 0.15, 14, 56)), scarfMat);
    wrap.rotation.x = Math.PI / 2 + 0.12;
    wrap.scale.set(1, 0.98, 1);
    const tail = new THREE.Mesh(this.own(new THREE.CapsuleGeometry(0.1, 0.34, 4, 12)), scarfMat);
    tail.position.set(0.34, -0.98, 0.62);
    tail.rotation.set(0.25, 0, 0.22);
    tail.scale.set(1, 1, 0.45);
    scarf.add(wrap, tail);
    scarf.position.y = -0.76;
    tail.position.y -= scarf.position.y; // keep the tail's absolute height

    root.add(beanie, scarf);
    return this.chrome;
  }

  /** Dark matte skin with a neon-green rim, a cat-ear hood and glowing drawstrings. */
  private hacker(root: THREE.Group) {
    const skin = this.own(
      addRim(
        new THREE.MeshPhysicalMaterial({ color: "#17191e", metalness: 0.2, roughness: 0.6, clearcoat: 0.3, clearcoatRoughness: 0.45, envMapIntensity: 0.9 }),
        "#39ff88",
        1.5,
        2.6,
      ),
    );
    const fabric = this.own(
      addRim(new THREE.MeshStandardMaterial({ color: "#23262d", roughness: 0.88, metalness: 0, side: THREE.DoubleSide }), "#39ff88", 1.1, 3.2),
    );
    const neon = this.own(new THREE.MeshBasicMaterial({ color: "#39ff88", toneMapped: false }));

    // A sphere with a round opening for the face (pole turned to face forward)
    const OPEN = 1.02;
    const hoodGeo = this.own(new THREE.SphereGeometry(1, 56, 32, 0, Math.PI * 2, OPEN, Math.PI - OPEN));
    hoodGeo.rotateX(Math.PI / 2);
    const hood = new THREE.Mesh(hoodGeo, fabric);
    const HS = [SX * 1.13, SY * 1.1, SZ * 1.08] as const;
    hood.scale.set(...HS);
    hood.position.set(0, 0.02, -0.04);
    const lip = new THREE.Mesh(this.own(new THREE.TorusGeometry(1, 0.06, 10, 64)), fabric);
    lip.position.set(0, 0.02, HS[2] * Math.cos(OPEN) - 0.04);
    lip.scale.set(HS[0] * Math.sin(OPEN), HS[1] * Math.sin(OPEN), 1);

    const stringGeo = this.own(new THREE.CylinderGeometry(0.022, 0.022, 0.36, 8));
    const tipGeo = this.own(new THREE.SphereGeometry(0.04, 12, 8));
    for (const side of [-1, 1]) {
      const x = side * 0.24;
      const y = -0.9;
      const s = new THREE.Mesh(stringGeo, neon);
      s.position.set(x, y, surfZ(x, -0.8) + 0.22);
      s.rotation.z = side * 0.08;
      const tip = new THREE.Mesh(tipGeo, neon);
      tip.position.set(x + side * 0.014, y - 0.19, s.position.z);
      root.add(s, tip);
    }
    root.add(hood, lip);
    return skin;
  }

  /** Polished gold with a crimson velvet bow tie. */
  private royal(root: THREE.Group) {
    const gold = this.own(
      new THREE.MeshPhysicalMaterial({
        color: "#ffc451",
        metalness: 1,
        roughness: 0.14,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
        iridescence: 0.12,
        iridescenceIOR: 1.4,
        envMapIntensity: 1.3,
      }),
    );
    const velvet = this.own(
      new THREE.MeshPhysicalMaterial({ color: "#b3122e", roughness: 0.42, metalness: 0, sheen: 1, sheenColor: new THREE.Color("#ff8aa0"), clearcoat: 0.3 }),
    );

    const bow = new THREE.Group();
    const wingGeo = this.own(new THREE.ConeGeometry(0.13, 0.24, 4, 1));
    wingGeo.rotateY(Math.PI / 4); // a flat face towards the viewer
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(wingGeo, velvet);
      wing.rotation.z = (side * Math.PI) / 2; // tips meet at the knot
      wing.position.x = side * 0.12;
      wing.scale.set(1, 1, 0.45);
      bow.add(wing);
    }
    const knot = new THREE.Mesh(this.own(new THREE.SphereGeometry(0.06, 20, 14)), velvet);
    knot.scale.set(1, 1.15, 0.7);
    bow.add(knot);
    const by = -0.66;
    bow.position.set(0, by, surfZ(0, by) + 0.05);
    bow.rotation.x = 0.62; // lies on the curve of the body
    root.add(bow);
    return gold;
  }
}
