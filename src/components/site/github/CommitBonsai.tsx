"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";

/* ═════════════════════════════════════════════════════════════════════
   Commit Bonsai
   Your contribution history, grown into a pixel bonsai.

   - The tree's shape is seeded from your name: same data, same tree.
   - Every week is a branch tip, left (oldest) to right (this week).
   - Commits grow foliage pads sized by count. Weeks with a commit every
     day blossom. Empty weeks stay bare twigs.
   - Seasons follow the calendar (or force one): spring blossoms,
     summer green, autumn leaves fall, winter snow.
   - Grows in on mount. Hover a pad for that week.
   ═════════════════════════════════════════════════════════════════════ */

export type Contribution = { date: string; count: number };
export type Season = "spring" | "summer" | "autumn" | "winter";

export interface CommitBonsaiProps {
  /** Daily contributions, GitHub-style. Any order. */
  contributions: Contribution[];
  /** Seeds the tree's shape. Use a username. */
  seed?: string;
  /** Number of trailing weeks to grow (8–80). */
  weeks?: number;
  /** "auto" picks from the latest date's month. */
  season?: Season | "auto";
  label?: string;
  className?: string;
}

/* ─────────────────────────── data ─────────────────────────── */

type Week = { start: Date; count: number; active: number; perfect: boolean };
const DAY = 864e5;

const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** "2026-11-21" as a local calendar day. `new Date("2026-11-21")` would be UTC
 *  midnight, i.e. the previous day for anyone west of Greenwich. */
const localDay = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
};

function toWeeks(data: Contribution[], n: number): Week[] {
  const byDay = new Map(data.map((d) => [d.date.slice(0, 10), d.count] as [string, number]));
  const end = data.length ? new Date(Math.max(...data.map((d) => +localDay(d.date)))) : new Date();
  const endSun = new Date(end.getFullYear(), end.getMonth(), end.getDate() - end.getDay());
  const out: Week[] = [];
  for (let w = n - 1; w >= 0; w--) {
    const start = new Date(endSun.getFullYear(), endSun.getMonth(), endSun.getDate() - w * 7);
    let count = 0;
    let active = 0;
    let days = 0;
    for (let d = 0; d < 7; d++) {
      const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d);
      if (day > end) break;
      days++;
      const c = byDay.get(fmt(day)) ?? 0;
      count += c;
      if (c > 0) active++;
    }
    out.push({ start, count, active, perfect: days === 7 && active === 7 });
  }
  return out;
}

function streaks(data: Contribution[]) {
  const days = new Set(data.filter((d) => d.count > 0).map((d) => d.date.slice(0, 10)));
  const sorted = Array.from(days).sort();
  let longest = 0;
  let run = 0;
  let prev = 0;
  for (const d of sorted) {
    const t = +localDay(d);
    run = prev && t - prev <= DAY * 1.5 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = t;
  }
  // current streak, counting back from the latest day
  let current = 0;
  if (sorted.length) {
    const last = localDay(sorted[sorted.length - 1]);
    for (let d = last; days.has(fmt(d)); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1)) current++;
  }
  return { longest, current };
}

/* ─────────────────────────── tree generation ─────────────────────────── */

function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const W = 128;
const H = 112;
type Seg = { x0: number; y0: number; x1: number; y1: number; w: number; order: number };
type Tip = { x: number; y: number; order: number };

function grow(seedStr: string, n: number) {
  const rnd = mulberry(hash(seedStr || "bonsai"));
  const r = (a: number, b: number) => a + rnd() * (b - a);
  const segs: Seg[] = [];
  const tips: Tip[] = [];
  let order = 0;

  // S-curved trunk
  const pts: [number, number][] = [[64, 95]];
  const sway = [r(-9, -4), r(4, 10), r(-6, -2), r(-2, 3)];
  for (let i = 0; i < 4; i++) {
    const [px, py] = pts[pts.length - 1];
    pts.push([px + sway[i], py - r(9, 12)]);
  }
  for (let i = 0; i < pts.length - 1; i++) {
    segs.push({ x0: pts[i][0], y0: pts[i][1], x1: pts[i + 1][0], y1: pts[i + 1][1], w: 8 - i * 1.2, order: order++ });
  }

  const branch = (x: number, y: number, ang: number, budget: number, depth: number, w: number) => {
    if (budget <= 1 || depth > 7) {
      tips.push({ x, y, order: order++ });
      return;
    }
    const k = budget >= 9 && depth < 2 ? 3 : 2;
    // split the budget
    const cuts: number[] = [];
    let left = budget;
    for (let i = 0; i < k - 1; i++) {
      const share = Math.max(1, Math.round((left / (k - i)) * r(0.75, 1.25)));
      cuts.push(Math.min(share, left - (k - 1 - i)));
      left -= cuts[cuts.length - 1];
    }
    cuts.push(left);
    const spread = depth === 0 ? 46 : 30 - depth * 2;
    cuts.forEach((b, i) => {
      const off = -spread + (2 * spread * i) / (k - 1);
      let a = ang + (off + r(-9, 9)) * (Math.PI / 180);
      // bonsai: limbs flatten toward horizontal as they extend
      if (depth >= 1) a += Math.cos(a) >= 0 ? 0.12 : -0.12;
      const len = (5 + Math.log2(b + 1) * 4.2) * r(0.85, 1.15) * (depth === 0 ? 1.25 : 1);
      const nx = x + Math.cos(a) * len;
      const ny = y + Math.sin(a) * len * (depth === 0 ? 0.85 : 0.6);
      segs.push({ x0: x, y0: y, x1: nx, y1: ny, w: Math.max(1, w * 0.68), order: order++ });
      branch(nx, ny, a, b, depth + 1, Math.max(1, w * 0.68));
    });
  };
  // informal-upright bonsai: limbs leave the trunk at several heights, alternating sides
  const side = rnd() < 0.5 ? -1 : 1;
  const lowB = Math.max(1, Math.round(n * r(0.17, 0.23)));
  const midB = Math.max(1, Math.round(n * r(0.2, 0.26)));
  const topB = Math.max(1, n - lowB - midB);
  const limb = (pt: [number, number], dir: number, b: number, w: number) => {
    const a = dir < 0 ? Math.PI + r(0.12, 0.38) : -r(0.12, 0.38);
    const len = 6 + Math.log2(b + 1) * 4.6;
    const nx = pt[0] + Math.cos(a) * len;
    const ny = pt[1] + Math.sin(a) * len * 0.5;
    segs.push({ x0: pt[0], y0: pt[1], x1: nx, y1: ny, w, order: order++ });
    branch(nx, ny, a + (dir < 0 ? 0.25 : -0.25), b, 1, w * 0.75);
  };
  limb(pts[2], side, lowB, 3.6);
  limb(pts[3], -side, midB, 3.1);
  const top = pts[pts.length - 1];
  branch(top[0], top[1], -Math.PI / 2, topB, 0, 3.4);

  // fit the crown into the frame, anchored at the trunk base
  const bx = 64;
  const by = 95;
  let minX = bx;
  let maxX = bx;
  let minY = by;
  for (const sg of segs) {
    minX = Math.min(minX, sg.x1, sg.x0);
    maxX = Math.max(maxX, sg.x1, sg.x0);
    minY = Math.min(minY, sg.y1, sg.y0);
  }
  for (const tp of tips) {
    minX = Math.min(minX, tp.x - 9);
    maxX = Math.max(maxX, tp.x + 9);
    minY = Math.min(minY, tp.y - 7);
  }
  const sc = Math.min(1.25, (bx - 6) / Math.max(1, bx - minX), (W - 6 - bx) / Math.max(1, maxX - bx), (by - 8) / Math.max(1, by - minY));
  const fx = (x: number) => bx + (x - bx) * sc;
  const fy = (y: number) => by + (y - by) * sc;
  for (const sg of segs) {
    sg.x0 = fx(sg.x0);
    sg.x1 = fx(sg.x1);
    sg.y0 = fy(sg.y0);
    sg.y1 = fy(sg.y1);
    sg.w = Math.max(1, sg.w * Math.sqrt(sc));
  }
  for (const tp of tips) {
    tp.x = fx(tp.x);
    tp.y = fy(tp.y);
  }
  tips.sort((a, b) => a.x - b.x);
  return { segs, tips, total: order };
}

/* ─────────────────────────── palettes ─────────────────────────── */

export const PAL = {
  spring: { leaf: ["#2f6b2f", "#4c9a3c", "#86c75a"], bloom: ["#ffb7d5", "#ff8fbf", "#fff0f6"] },
  summer: { leaf: ["#1f4f2a", "#2f7a3a", "#4fa34a"], bloom: ["#fff5c2", "#ffe066", "#ffffff"] },
  autumn: { leaf: ["#7a2f10", "#c55a1c", "#f0a03a"], bloom: ["#ffd166", "#ff9f43", "#fff2c7"] },
  winter: { leaf: ["#1d3a2d", "#2b5540", "#3d6d51"], bloom: ["#ffd1e1", "#ff9fbf", "#ffffff"] },
};
export const BARK = ["#2f2118", "#4f382a", "#6f5038"];

// Parsed once: the renderer looks colours up for every pixel, every frame
const rgbCache = new Map<string, [number, number, number]>();
function rgb(hex: string) {
  let c = rgbCache.get(hex);
  if (!c) {
    const n = parseInt(hex.slice(1), 16);
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbCache.set(hex, c);
  }
  return c;
}

export function seasonFor(date: Date): Season {
  const m = date.getMonth();
  return m >= 2 && m <= 4 ? "spring" : m >= 5 && m <= 7 ? "summer" : m >= 8 && m <= 10 ? "autumn" : "winter";
}

/* ─────────────────────────── component ─────────────────────────── */

export function CommitBonsai({ contributions, seed = "bonsai", weeks = 52, season = "auto", label, className = "" }: CommitBonsaiProps) {
  const n = Math.max(8, Math.min(80, weeks));
  const data = useMemo(() => toWeeks(contributions, n), [contributions, n]);
  const tree = useMemo(() => grow(seed, n), [seed, n]);
  const st = useMemo(() => streaks(contributions), [contributions]);
  // Season comes from the latest day in the data (the week start can sit in the previous month)
  const latestDay = useMemo(
    () => (contributions.length ? new Date(Math.max(...contributions.map((d) => +localDay(d.date)))) : new Date()),
    [contributions],
  );
  const S = season === "auto" ? seasonFor(latestDay) : season;
  const max = Math.max(1, ...data.map((w) => w.count));

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const hoverRef = useRef<number | null>(null);
  const live = useRef({ data, tree, S, max });
  useEffect(() => {
    hoverRef.current = hover;
    live.current = { data, tree, S, max };
  // Same row id -> same tip and offset for everyone
  const placed = useMemo(() => {
    const leafy = tree.tips.map((_, i) => i).filter((i) => (data[i]?.count ?? 0) > 0);
    const pool = leafy.length ? leafy : tree.tips.map((_, i) => i);
    return (waterings ?? []).slice(0, 120).map((w) => {
      const h = hash(w.id);
      const tip = tree.tips[pool[h % pool.length]];
      const dx = (((h >>> 8) % 100) / 100 - 0.5) * 9;
      const dy = -(((h >>> 16) % 100) / 100) * 6 - 1;
      return { ...w, x: tip.x + dx, y: tip.y + dy, tilt: (((h >>> 4) % 40) - 20) };
    });
  }, [waterings, tree, data]);
  }, [hover, data, tree, S, max]);
  // 0 until the tree first scrolls into view, then the moment it started growing
  const born = useRef(0);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const g = cv.getContext("2d");
    if (!g) return;
    const small = document.createElement("canvas");
    small.width = W;
    small.height = H;
    const sg = small.getContext("2d");
    if (!sg) return;
    const img = sg.createImageData(W, H);
    const buf = img.data;
    cv.width = W * 4;
    cv.height = H * 4;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) born.current = -1e9;

    type Leaf = { x: number; y: number; vx: number; vy: number; c: string; land: number };
    let leaves: Leaf[] = [];
    let flakes: { x: number; y: number; v: number }[] = [];
    let lastSeason = "";

    const put = (x: number, y: number, hex: string, a = 255) => {
      x = Math.round(x);
      y = Math.round(y);
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const [rr, gg, bb] = rgb(hex);
      const i = (y * W + x) * 4;
      buf[i] = rr;
      buf[i + 1] = gg;
      buf[i + 2] = bb;
      buf[i + 3] = a;
    };
    const line = (s: Seg, prog: number) => {
      const x1 = s.x0 + (s.x1 - s.x0) * prog;
      const y1 = s.y0 + (s.y1 - s.y0) * prog;
      const len = Math.hypot(x1 - s.x0, y1 - s.y0);
      const steps = Math.max(1, Math.ceil(len * 2));
      const rad = s.w / 2;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = s.x0 + (x1 - s.x0) * t;
        const y = s.y0 + (y1 - s.y0) * t;
        const rw = rad * (1 - t * 0.25);
        for (let dx = -Math.ceil(rw); dx <= Math.ceil(rw); dx++) {
          for (let dy = -Math.ceil(rw); dy <= Math.ceil(rw); dy++) {
            if (dx * dx + dy * dy > rw * rw + 0.6) continue;
            put(x + dx, y + dy, dx < -rw * 0.3 ? BARK[2] : dx > rw * 0.35 ? BARK[0] : BARK[1]);
          }
        }
      }
    };

    let raf = 0;
    let lastPaint = 0;
    let visible = false;
    const io = new IntersectionObserver(([e]) => {
      const was = visible;
      visible = e.isIntersecting;
      // Start growing the first time it comes into view, not at page load
      if (visible && !was && born.current === 0) born.current = performance.now();
    });
    io.observe(cv);

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden || now - lastPaint < 50) return; // ~20 fps, pixel-art cadence
      const dt = Math.min(0.2, (now - (lastPaint || now)) / 1000);
      lastPaint = now;
      const { data: D, tree: T, S: SS, max: M } = live.current;
      const P = PAL[SS];
      if (SS !== lastSeason) {
        leaves = [];
        flakes = [];
        lastSeason = SS;
      }
      const t = now / 1000;
      const p = born.current === 0 ? 0 : Math.min(1, (now - born.current) / 2200); // growth progress
      buf.fill(0);

      /* pot */
      for (let x = 40; x <= 88; x++) {
        put(x, 94, "#3d2b1f");
        if ((x * 7) % 5 === 0) put(x, 93, SS === "winter" ? "#f4f7fb" : "#4f7a3a");
      }
      for (let x = 34; x <= 94; x++) {
        put(x, 95, "#5a6d96");
        put(x, 96, "#3b4a6b");
      }
      for (let y = 97; y <= 104; y++) {
        const inset = Math.floor((y - 97) / 2);
        for (let x = 37 + inset; x <= 91 - inset; x++) put(x, y, x < 44 + inset ? "#4a5b80" : y === 104 ? "#222b40" : "#2d3a55");
      }
      for (let x = 44; x <= 84; x += 2) put(x, 100, "#3b4a6b");
      [
        [42, 105],
        [82, 105],
      ].forEach(([x, y]) => {
        for (let i = 0; i < 4; i++) {
          put(x + i, y, "#222b40");
          put(x + i, y + 1, "#1a2031");
        }
      });

      /* branches (grow in order) */
      const sway = (y: number, x: number) => (reduced ? 0 : Math.round(Math.sin(t * 0.9 + x * 0.07) * (1 - y / 95) * 1.1));
      for (const s of T.segs) {
        const sp = Math.min(1, Math.max(0, p * 1.5 * T.total - s.order) / 1.0);
        if (sp <= 0) continue;
        const k = sway(s.y1, s.x1);
        line({ ...s, x1: s.x1 + (s.y1 < 70 ? k : 0) }, sp);
      }

      /* foliage pads */
      const padProg = Math.max(0, (p - 0.55) / 0.45);
      T.tips.forEach((tip, i) => {
        if (i / T.tips.length > padProg) return;
        const wk = D[i];
        if (!wk) return;
        const dx = sway(tip.y, tip.x);
        const x0 = tip.x + dx;
        const y0 = tip.y;
        if (wk.count === 0) {
          // bare twig
          put(x0 + 1, y0 - 1, BARK[1]);
          put(x0 + 2, y0 - 2, BARK[1]);
          put(x0 - 1, y0 - 1, BARK[1]);
          if (SS === "winter") put(x0 + 2, y0 - 3, "#f4f7fb");
          return;
        }
        const r = 1.6 + Math.sqrt(wk.count / M) * 4.4;
        const rx = r * 1.35;
        const ry = r * 0.78;
        const rnd = mulberry(hash(`${i}`) + 7);
        const hl = hoverRef.current === i;
        for (let y = Math.floor(-ry); y <= Math.ceil(ry); y++) {
          for (let x = Math.floor(-rx); x <= Math.ceil(rx); x++) {
            const d = (x * x) / (rx * rx) + (y * y) / (ry * ry);
            const edge = rnd();
            if (d > 1 || (d > 0.7 && edge < 0.35)) continue;
            const shade = y < -ry * 0.35 && x < rx * 0.3 ? 2 : y > ry * 0.35 ? 0 : 1;
            let c = P.leaf[shade];
            if (SS === "autumn" && edge > 0.86) c = "#b8321f";
            put(x0 + x, y0 + y - 1, hl ? (shade === 2 ? "#ffffff" : c) : c);
            if (wk.perfect && edge > 0.82 && d < 0.85) put(x0 + x, y0 + y - 1, P.bloom[(x + y + 9) % 3 === 0 ? 2 : x & 1 ? 1 : 0]);
          }
        }
        if (SS === "winter") for (let x = Math.floor(-rx * 0.8); x <= Math.ceil(rx * 0.8); x++) put(x0 + x, y0 - ry - 1 + (Math.abs(x) / rx) * 1.5, "#f4f7fb");
        if (hl) {
          // outline ring
          for (let a = 0; a < Math.PI * 2; a += 0.12) put(x0 + Math.cos(a) * (rx + 1.5), y0 - 1 + Math.sin(a) * (ry + 1.5), "#ffffff", 220);
        }
        // occasional falling leaf
        if (!reduced && p >= 1 && (SS === "autumn" ? 0.03 : SS === "spring" && wk.perfect ? 0.02 : 0.004) * (wk.count / M + 0.3) > Math.random()) {
          leaves.push({
            x: x0 + (Math.random() - 0.5) * rx,
            y: y0 + ry * 0.5,
            vx: (Math.random() - 0.5) * 6,
            vy: 6 + Math.random() * 5,
            c: SS === "spring" && wk.perfect ? P.bloom[1] : P.leaf[1 + Math.floor(Math.random() * 2)],
            land: 0,
          });
        }
      });

      /* leaves & snow */
      leaves = leaves
        .filter((l) => {
          if (l.land) {
            l.land -= dt;
            put(l.x, l.y, l.c);
            return l.land > 0;
          }
          l.x += (l.vx + Math.sin(t * 3 + l.y) * 5) * dt;
          l.y += l.vy * dt;
          put(l.x, l.y, l.c);
          if (l.y >= 93 && l.x > 36 && l.x < 92) {
            l.y = 93;
            l.land = 6;
          }
          return l.y < H;
        })
        .slice(-90);
      if (SS === "winter" && !reduced) {
        if (Math.random() < dt * 9) flakes.push({ x: Math.random() * W, y: 0, v: 5 + Math.random() * 6 });
        flakes = flakes.filter((f) => {
          f.y += f.v * dt;
          f.x += Math.sin(t + f.y * 0.2) * 0.1;
          put(f.x, f.y, "#f4f7fb", 200);
          return f.y < H;
        });
      }

      sg.putImageData(img, 0, 0);
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, cv.width, cv.height);
      // soft shadow under pot
      g.fillStyle = "rgba(0,0,0,.18)";
      g.beginPath();
      g.ellipse(64 * 4, 108 * 4, 34 * 4, 3 * 4, 0, 0, Math.PI * 2);
      g.fill();
      g.drawImage(small, 0, 0, W * 4, H * 4);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, []);

  /* hover → nearest pad */
  const onMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const y = ((e.clientY - r.top) / r.height) * H;
    let best = -1;
    let bd = 64;
    tree.tips.forEach((tp, i) => {
      const d = (tp.x - x) ** 2 + (tp.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    setHover(best >= 0 ? best : null);
  };

  const total = data.reduce((a, w) => a + w.count, 0);
  const best = data.reduce((a, w) => (w.count > a.count ? w : a), data[0] ?? { count: 0, start: new Date(), active: 0, perfect: false });
  const perfect = data.filter((w) => w.perfect).length;
  const hw = hover !== null ? data[hover] : undefined;
  const ht = hover !== null ? tree.tips[hover] : undefined;
  const dfmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div className={`w-full max-w-[560px] rounded-[22px] border border-line bg-bg-elevated p-4 shadow-soft ${className}`}>
      <div className="flex items-baseline justify-between gap-3 px-1">
        <span className="truncate text-[14px] font-medium text-ink">{label ?? `${seed}'s bonsai`}</span>
        <span className="shrink-0 font-mono text-[10.5px] tracking-[0.14em] text-ink-3 uppercase">
          {n} weeks · {S}
        </span>
      </div>
      <div className="relative mt-2">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Bonsai grown from ${total} contributions over ${n} weeks. ${perfect} perfect weeks, longest streak ${st.longest} days.`}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
          className="block aspect-[128/112] w-full cursor-crosshair [image-rendering:pixelated]"
        />
        {hw && ht && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+14px)] rounded-lg border border-line bg-bg-elevated px-2 py-1 whitespace-nowrap text-ink shadow-soft"
            style={{ left: `${(ht.x / W) * 100}%`, top: `${(ht.y / H) * 100}%` }}
          >
            <div className="text-[12px] font-medium">
              {hw.count} contribution{hw.count === 1 ? "" : "s"}
              {hw.perfect && <span className="ml-1.5 text-accent-text">· perfect week</span>}
            </div>
            <div className="font-mono text-[10px] tracking-[0.1em] text-ink-3 uppercase">
              Week of {dfmt(hw.start)} · {hw.active}/7 days
            </div>
          </div>
        )}
      </div>
      <dl className="mt-3 grid grid-cols-4 gap-2 border-t border-line pt-3 text-center">
        {[
          ["Total", total.toLocaleString("en-US")],
          ["Best week", String(best?.count ?? 0)],
          ["Streak", `${st.current}d`],
        {placed.length > 0 && (
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden [container-type:inline-size]">
            {placed.map((b) => (
              <motion.span
                key={b.id}
                initial={b.id === freshId ? { scale: 0, rotate: -40, opacity: 0 } : false}
                animate={{ scale: 1, rotate: b.tilt, opacity: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 12, delay: b.id === freshId ? 0.9 : 0 }}
                className="absolute -translate-x-1/2 -translate-y-1/2 leading-none drop-shadow-[0_1px_1px_rgba(0,0,0,.25)]"
                style={{ left: `${(b.x / W) * 100}%`, top: `${(b.y / H) * 100}%`, fontSize: "4.4cqw" }}
              >
                {BLOSSOMS[b.blossom] ?? BLOSSOMS[0]}
              </motion.span>
            ))}
          </div>
        )}
        <AnimatePresence>
          {pourKey > 0 && <Pour key={pourKey} />}
        </AnimatePresence>
          ["Longest", `${st.longest}d`],
        ].map(([k, v]) => (
          <div key={k} className="flex flex-col-reverse">
            <dt className="mt-0.5 text-[10.5px] tracking-[0.1em] text-ink-3 uppercase">{k}</dt>
            <dd className="font-mono text-[15px] font-medium text-ink tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px] text-ink-3">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-[2px]" style={{ background: PAL[S].leaf[1] }} />
          pad = commits
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-[2px]" style={{ background: PAL[S].bloom[1] }} />
          blossom = perfect week
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-[2px]" style={{ background: BARK[1] }} />
          bare = no commits
        </span>
        <span className="ml-auto">← past · now →</span>
      </div>
    </div>
  );
}

export default CommitBonsai;
/** Watering can tips over the crown and drops fall onto the branches. */
function Pour() {
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <motion.svg
        viewBox="0 0 64 48"
        className="absolute top-[3%] right-[6%] w-[22%] text-ink drop-shadow-md"
        initial={{ x: 40, y: -10, rotate: 0, opacity: 0 }}
        animate={{ x: [40, 0, 0, 0, 40], y: [-10, 0, 0, 0, -10], rotate: [0, 0, -28, -28, 0], opacity: [0, 1, 1, 1, 0] }}
        transition={{ duration: 2.1, times: [0, 0.18, 0.35, 0.8, 1], ease: "easeInOut" }}
        style={{ transformOrigin: "50% 80%" }}
      >
        <path d="M14 18h30l-3 24a4 4 0 0 1-4 3H21a4 4 0 0 1-4-3z" fill="#8fb4e8" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
        <path d="M14 22 4 12l-1 6 11 8" fill="#8fb4e8" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
        <path d="M44 24c6 0 9 3 9 8s-4 8-9 8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M18 18c0-7 4-11 11-11s11 4 11 11" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </motion.svg>
      {Array.from({ length: 12 }, (_, i) => (
        <motion.span
          key={i}
          className="absolute size-[7px] rounded-full bg-[#7fb2f0]"
          style={{ left: `${30 + ((i * 37) % 38)}%`, top: "14%", borderRadius: "50% 50% 50% 50% / 60% 60% 40% 40%" }}
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: [0, 1, 1, 0], y: [0, 90 + (i % 4) * 28] }}
          transition={{ delay: 0.7 + (i % 6) * 0.1 + (i > 5 ? 0.35 : 0), duration: 0.75, ease: "easeIn" }}
        />
      ))}
    </motion.div>
  );
}

