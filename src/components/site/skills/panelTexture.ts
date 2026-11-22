import type { SkillCategoryWithSkills, SkillLevel } from "@/lib/types";

/**
 * Draws one skill category as a panel texture for the lens carousel, in the
 * site's own look: a soft surface card, the category name set big, and a
 * monospace "terminal sheet" listing the skills with level bars. Colours and
 * fonts are read live from the page, so both themes (and dashboard edits)
 * come through.
 */

export const TEX_W = 720;
export const TEX_H = 940;
export const PANEL_ASPECT = TEX_W / TEX_H;
const PAD = 52;

const BARS: Record<SkillLevel, number> = { expert: 3, proficient: 2, familiar: 1 };

export type PanelTheme = {
  dark: boolean;
  bg: string;
  elevated: string;
  surface: string;
  surface2: string;
  surface3: string;
  ink: string;
  ink2: string;
  ink3: string;
  line: string;
  accent: string;
  accentSoft: string;
  accentText: string;
  amber: string;
  mint: string;
  sans: string;
  mono: string;
};

let probeCtx: CanvasRenderingContext2D | null = null;
/** Normalises any CSS colour to `#rrggbb` (alpha dropped) via a canvas. */
export function toHex(css: string, fallback = "#000000") {
  probeCtx ??= document.createElement("canvas").getContext("2d");
  if (!probeCtx) return fallback;
  probeCtx.fillStyle = fallback;
  probeCtx.fillStyle = css;
  const v = String(probeCtx.fillStyle);
  if (v.startsWith("#")) return v;
  const m = v.match(/[\d.]+/g);
  if (!m) return fallback;
  return `#${m
    .slice(0, 3)
    .map((n) => Math.round(Number(n)).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** `#rrggbb` -> 0..1 channels. */
export const hexToRgb = (h: string): [number, number, number] =>
  [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];

/** Reads the current theme's tokens and fonts from the page. */
export function readTheme(): PanelTheme {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const v = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb;
  const probe = document.createElement("span");
  probe.className = "font-mono";
  probe.style.cssText = "position:absolute;visibility:hidden;pointer-events:none";
  document.body.appendChild(probe);
  const mono = getComputedStyle(probe).fontFamily || "ui-monospace, monospace";
  probe.remove();
  return {
    dark: root.dataset.theme === "dark",
    bg: v("--bg", "#ffffff"),
    elevated: v("--bg-elevated", "#ffffff"),
    surface: v("--surface", "#f4f4f1"),
    surface2: v("--surface-2", "#efefeb"),
    surface3: v("--surface-3", "#e4e4df"),
    ink: v("--ink", "#161615"),
    ink2: v("--ink-2", "#4b4b47"),
    ink3: v("--ink-3", "#8a8a85"),
    line: v("--line", "rgba(22,22,21,0.08)"),
    accent: v("--accent", "#e0527a"),
    accentSoft: v("--accent-soft", "#fde9ef"),
    accentText: v("--accent-text", "#c23a62"),
    amber: v("--amber", "#e5a11b"),
    mint: v("--mint", "#12805c"),
    sans: getComputedStyle(document.body).fontFamily || "system-ui, sans-serif",
    mono,
  };
}

/** Makes sure the weights we draw with are loaded before painting. */
export async function loadPanelFonts(t: PanelTheme) {
  if (!document.fonts) return;
  await Promise.all(
    [`600 64px ${t.sans}`, `400 26px ${t.sans}`, `400 24px ${t.mono}`, `500 24px ${t.mono}`].map((f) =>
      document.fonts.load(f).catch(() => []),
    ),
  );
}

/** A category's icon as an image tinted `color` (from a rendered lucide SVG). */
export function iconImage(svg: SVGSVGElement | null, color: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    if (!svg) return resolve(null);
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("width", "96");
    clone.setAttribute("height", "96");
    clone.removeAttribute("class");
    const xml = new XMLSerializer().serializeToString(clone).replaceAll("currentColor", color);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  });
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Ellipsises `text` to fit `maxWidth`. */
function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxWidth) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  let used = 0;
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= maxWidth || !line) {
      line = next;
      used++;
    } else {
      lines.push(line);
      if (lines.length === maxLines) break;
      line = w;
      used++;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  const truncated = used < words.length || lines.length > maxLines;
  const out = lines.slice(0, maxLines).map((l) => fit(ctx, l, maxWidth));
  if (truncated && out.length) out[out.length - 1] = fit(ctx, `${out[out.length - 1]}…`, maxWidth);
  return out;
}

type Ctx = CanvasRenderingContext2D & { letterSpacing?: string };
const spacing = (ctx: Ctx, v: string) => {
  if ("letterSpacing" in ctx) ctx.letterSpacing = v;
};

export const slugOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Paints category `cat` onto `canvas` (resized to TEX_W x TEX_H). */
export function drawPanel(
  canvas: HTMLCanvasElement,
  cat: SkillCategoryWithSkills,
  index: number,
  total: number,
  t: PanelTheme,
  icon: HTMLImageElement | null,
) {
  if (canvas.width !== TEX_W) canvas.width = TEX_W;
  if (canvas.height !== TEX_H) canvas.height = TEX_H;
  const ctx = canvas.getContext("2d") as Ctx;
  ctx.clearRect(0, 0, TEX_W, TEX_H);
  ctx.textBaseline = "alphabetic";

  // Card body (corners are rounded in the shader)
  ctx.fillStyle = t.surface;
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  // A faint sakura bloom in the top-right corner
  // (stops share one colour: fading to transparent black would turn grey)
  const [ar, ag, ab] = hexToRgb(toHex(t.accent, "#e0527a")).map((c) => Math.round(c * 255));
  const bloom = ctx.createRadialGradient(TEX_W, 0, 0, TEX_W, 0, TEX_W * 0.85);
  bloom.addColorStop(0, `rgba(${ar},${ag},${ab},${t.dark ? 0.16 : 0.11})`);
  bloom.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  // Top row: index and icon tile
  ctx.font = `400 22px ${t.mono}`;
  spacing(ctx, "0.08em");
  ctx.fillStyle = t.ink3;
  ctx.fillText(`${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, PAD, PAD + 22);
  const ic = 72;
  const ix = TEX_W - PAD - ic;
  const iy = PAD - 14;
  ctx.fillStyle = t.dark ? t.surface3 : t.elevated;
  rr(ctx, ix, iy, ic, ic, 22);
  ctx.fill();
  if (icon) ctx.drawImage(icon, ix + 19, iy + 19, ic - 38, ic - 38);

  // Name, set big (drops a size for long names)
  spacing(ctx, "-0.035em");
  ctx.fillStyle = t.ink;
  const maxW = TEX_W - PAD * 2;
  let size = 72;
  ctx.font = `600 ${size}px ${t.sans}`;
  let name = wrap(ctx, cat.name, maxW, 2);
  if (name.length > 1) {
    size = 60;
    ctx.font = `600 ${size}px ${t.sans}`;
    name = wrap(ctx, cat.name, maxW, 2);
  }
  let y = 200;
  name.forEach((l, i) => ctx.fillText(l, PAD - 3, y + i * size * 1.04));
  y += (name.length - 1) * size * 1.04;

  // Description
  spacing(ctx, "-0.01em");
  if (cat.description) {
    ctx.font = `400 25px ${t.sans}`;
    ctx.fillStyle = t.ink3;
    const desc = wrap(ctx, cat.description, maxW, 2);
    y += 50;
    desc.forEach((l, i) => ctx.fillText(l, PAD, y + i * 35));
    y += (desc.length - 1) * 35;
  }

  // Terminal sheet
  const sx = PAD - 16;
  const sw = TEX_W - sx * 2;
  const sy = y + 42;
  const footH = 116;
  const sh = TEX_H - sy - footH;
  ctx.save();
  ctx.shadowColor = t.dark ? "rgba(0,0,0,0.55)" : "rgba(22,22,21,0.10)";
  ctx.shadowBlur = 34;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = t.dark ? t.surface2 : t.elevated;
  rr(ctx, sx, sy, sw, sh, 24);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = t.line;
  ctx.lineWidth = 2;
  rr(ctx, sx + 1, sy + 1, sw - 2, sh - 2, 23);
  ctx.stroke();

  // Window bar
  const bar = 56;
  ctx.globalAlpha = 0.85;
  [t.accent, t.amber, t.mint].forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(sx + 30 + i * 22, sy + bar / 2, 6, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  ctx.font = `400 20px ${t.mono}`;
  spacing(ctx, "0px");
  ctx.fillStyle = t.ink3;
  ctx.fillText(fit(ctx, `~/skills/${slugOf(cat.name)}`, sw - 130), sx + 104, sy + bar / 2 + 7);
  ctx.fillStyle = t.line;
  ctx.fillRect(sx, sy + bar, sw, 2);

  // Rows: "› name ....... ▮▮▯"
  const skills = cat.skills;
  const avail = sh - bar - 30;
  const room = Math.max(1, Math.floor(avail / 46));
  // Short lists breathe a little more instead of leaving an empty window
  const rowH = Math.min(58, Math.max(46, avail / Math.max(1, Math.min(skills.length, room) + 1.2)));
  const top = sy + bar + 22;
  const shown = skills.length > room ? room - 1 : skills.length;
  const barW = 24;
  const barGap = 6;
  const barsW = barW * 3 + barGap * 2;
  for (let i = 0; i < shown; i++) {
    const s = skills[i];
    const ry = top + i * rowH + 26;
    ctx.font = `500 24px ${t.mono}`;
    ctx.fillStyle = t.accent;
    ctx.fillText("›", sx + 28, ry);
    ctx.font = `400 24px ${t.mono}`;
    ctx.fillStyle = t.ink;
    ctx.fillText(fit(ctx, s.name, sw - 84 - barsW - 36), sx + 58, ry);
    const bx = sx + sw - 30 - barsW;
    for (let b = 0; b < 3; b++) {
      ctx.fillStyle = b < BARS[s.level] ? t.accent : t.surface3;
      rr(ctx, bx + b * (barW + barGap), ry - 15, barW, 11, 3);
      ctx.fill();
    }
  }
  if (shown < skills.length) {
    ctx.font = `400 22px ${t.mono}`;
    ctx.fillStyle = t.ink3;
    ctx.fillText(`+ ${skills.length - shown} more`, sx + 58, top + shown * rowH + 26);
  }

  // Footer: count and level breakdown
  const fy = TEX_H - 48;
  ctx.font = `600 56px ${t.sans}`;
  spacing(ctx, "-0.035em");
  ctx.fillStyle = t.ink;
  const count = String(skills.length);
  ctx.fillText(count, PAD - 2, fy);
  const cw = ctx.measureText(count).width;
  ctx.font = `400 24px ${t.sans}`;
  spacing(ctx, "-0.01em");
  ctx.fillStyle = t.ink3;
  ctx.fillText(skills.length === 1 ? "skill" : "skills", PAD + cw + 10, fy);

  const tally = (["expert", "proficient", "familiar"] as const)
    .map((l) => [l, skills.filter((s) => s.level === l).length] as const)
    .filter(([, n]) => n);
  ctx.font = `400 18px ${t.mono}`;
  spacing(ctx, "0.06em");
  let tx = TEX_W - PAD;
  for (let i = tally.length - 1; i >= 0; i--) {
    const [l, n] = tally[i];
    const label = `${n} ${l.toUpperCase()}`;
    tx -= ctx.measureText(label).width;
    ctx.fillStyle = t.ink3;
    ctx.fillText(label, tx, fy - 6);
    for (let b = 0; b < BARS[l]; b++) {
      ctx.fillStyle = t.accent;
      rr(ctx, tx - 14 - (BARS[l] - 1 - b) * 9, fy - 18, 6, 11, 2);
      ctx.fill();
    }
    tx -= 26 + BARS[l] * 9;
  }
  spacing(ctx, "0px");
  return canvas;
}
