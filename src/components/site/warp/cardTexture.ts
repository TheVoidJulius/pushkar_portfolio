import type { Project } from "@/lib/types";

/**
 * Draws one project as a glowing "stat card" (in the style of the warp
 * carousel reference) onto a canvas, which becomes the card's texture.
 * Everything comes from the live project data, so dashboard edits show up.
 */

export const TEX_W = 760;
export const TEX_H = Math.round(TEX_W * 1.26);
const PAD = 58;
const RADIUS = 40;

// Used when a project has no cover, or its colours can't be read
const PALETTE = ["#1f6bff", "#e0306a", "#8a3ffc", "#11a8c9", "#ff7a1a", "#2bb673", "#d946ef"];

function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // Supabase storage sends CORS headers; without them we skip the cover
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

type RGB = [number, number, number];

const hex = ([r, g, b]: RGB) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
const parse = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgba = (c: RGB, a: number) => `rgba(${c.map(Math.round).join(",")},${a})`;

/** The cover's most vivid colour, so each card glows in its own hue. */
function accentOf(img: HTMLImageElement): RGB | null {
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 24;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, 24, 24);
    const data = ctx.getImageData(0, 0, 24, 24).data;
    let best: RGB | null = null;
    let bestScore = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const score = (max - min) * (0.4 + max / 255); // saturated and bright
      if (score > bestScore) {
        bestScore = score;
        best = [r, g, b];
      }
    }
    if (!best || bestScore < 40) return null;
    // Push it to a vivid version of itself
    const max = Math.max(...best);
    return best.map((v) => Math.min(255, (v / max) * 235)) as RGB;
  } catch {
    return null; // tainted canvas: keep the palette colour
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = w;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(" ") !== lines.join(" ")) {
    let last = lines[maxLines - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last.trimEnd()}…`;
  }
  return lines;
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement) {
  const s = Math.max(TEX_W / img.naturalWidth, TEX_H / img.naturalHeight);
  const w = img.naturalWidth * s;
  const h = img.naturalHeight * s;
  ctx.drawImage(img, (TEX_W - w) / 2, (TEX_H - h) / 2, w, h);
}

export async function drawProjectCard(p: Project, index: number, total: number, font: string) {
  const canvas = document.createElement("canvas");
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext("2d")!;
  const img = p.image_url ? await loadImage(p.image_url) : null;
  const accent: RGB = (img && accentOf(img)) || parse(PALETTE[index % PALETTE.length]);
  const deep: RGB = mix(accent, [2, 4, 14], 0.86);
  const bright: RGB = mix(accent, [190, 240, 255], 0.55);

  ctx.save();
  roundRect(ctx, 0, 0, TEX_W, TEX_H, RADIUS);
  ctx.clip();

  // Base: deep at the top, the card's colour pooling toward the bottom
  const base = ctx.createLinearGradient(0, 0, TEX_W * 0.35, TEX_H);
  base.addColorStop(0, rgba(deep, 1));
  base.addColorStop(0.55, rgba(mix(deep, accent, 0.45), 1));
  base.addColorStop(1, rgba(accent, 1));
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  if (img) {
    ctx.globalAlpha = 0.42;
    ctx.globalCompositeOperation = "luminosity";
    drawCover(ctx, img);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }

  // Light pooling bottom-right, shadow top-left: the reference's glassy depth
  const pool = ctx.createRadialGradient(TEX_W * 0.92, TEX_H * 0.98, 0, TEX_W * 0.92, TEX_H * 0.98, TEX_W * 0.75);
  pool.addColorStop(0, rgba(bright, 0.85));
  pool.addColorStop(0.45, rgba(accent, 0.35));
  pool.addColorStop(1, rgba(accent, 0));
  ctx.fillStyle = pool;
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  const shade = ctx.createRadialGradient(TEX_W * 0.28, TEX_H * 0.3, 0, TEX_W * 0.28, TEX_H * 0.3, TEX_W * 0.7);
  shade.addColorStop(0, "rgba(0,0,8,0.55)");
  shade.addColorStop(1, "rgba(0,0,8,0)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  ctx.fillStyle = "#fff";
  ctx.textBaseline = "alphabetic";

  // Title (top-left)
  ctx.font = `500 44px ${font}`;
  const title = wrap(ctx, p.title, TEX_W - PAD * 2, 2);
  title.forEach((l, i) => ctx.fillText(l, PAD, PAD + 44 + i * 54));
  const meta = [p.category, p.year].filter(Boolean).join(" · ");
  if (meta) {
    ctx.font = `400 23px ${font}`;
    ctx.fillStyle = "rgba(255,255,255,0.62)";
    ctx.fillText(meta.toUpperCase(), PAD, PAD + 44 + title.length * 54 + 6);
  }

  // Big index, like the reference's stat number
  const num = String(index + 1).padStart(2, "0");
  ctx.font = `300 230px ${font}`;
  const nw = ctx.measureText(num).width;
  const cy = TEX_H * 0.56;
  ctx.fillStyle = rgba(bright, 1);
  ctx.fillText(num, (TEX_W - nw) / 2 - 18, cy);
  ctx.font = `300 52px ${font}`;
  ctx.fillText(`/${String(total).padStart(2, "0")}`, (TEX_W + nw) / 2 - 8, cy - 150);

  // Track with a knob at this project's place in the list
  const ty = cy + 40;
  ctx.strokeStyle = "rgba(255,255,255,0.32)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD - 10, ty);
  ctx.lineTo(TEX_W - PAD + 10, ty);
  ctx.stroke();
  const kx = PAD - 10 + (TEX_W - PAD * 2 + 20) * (total > 1 ? index / (total - 1) : 0.5);
  ctx.fillStyle = "#fff";
  ctx.shadowColor = "rgba(255,255,255,0.8)";
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(kx, ty, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.font = `400 24px ${font}`;
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  const left = p.technologies[0] ?? p.category ?? "";
  const right = p.technologies[1] ?? p.year ?? "";
  ctx.fillText(left, PAD - 10, ty + 40);
  ctx.fillText(right, TEX_W - PAD + 10 - ctx.measureText(right).width, ty + 40);

  // Bottom line: the outcome if there is one, else the summary
  ctx.font = `400 32px ${font}`;
  ctx.fillStyle = "rgba(255,255,255,0.94)";
  const foot = wrap(ctx, p.highlight || p.summary, TEX_W - PAD * 2, 2);
  foot.forEach((l, i) => ctx.fillText(l, PAD, TEX_H - PAD - (foot.length - 1 - i) * 42));

  ctx.restore();

  // Hairline border, like light catching the glass edge
  roundRect(ctx, 1, 1, TEX_W - 2, TEX_H - 2, RADIUS - 1);
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 2;
  ctx.stroke();

  return { canvas, accent: hex(accent) };
}
