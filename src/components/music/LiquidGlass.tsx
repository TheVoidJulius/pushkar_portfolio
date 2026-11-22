"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties, type RefObject } from "react";

/**
 * Apple-style "liquid glass".
 *
 * Every browser gets the frosted, saturated glass with a moving specular
 * highlight and bright rim (CSS: .liquid-glass in globals.css). Chromium
 * browsers also get true refraction: the backdrop is bent at the glass's
 * edges by an SVG displacement map, like light through a thick lens.
 * (Safari and Firefox don't support SVG filters in backdrop-filter.)
 */

const noop = () => () => {};
/** Chromium only: the one engine that supports `backdrop-filter: url(#svg-filter)`. */
export function useRefractionSupport() {
  return useSyncExternalStore(
    noop,
    () => {
      const brands = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands;
      return Boolean(brands?.some((b) => /Chromium/i.test(b.brand))) && !matchMedia("(prefers-reduced-transparency: reduce)").matches;
    },
    () => false,
  );
}

/**
 * The displacement map: neutral grey (no bend) in the middle, ramps of red
 * (x) and blue (y) toward the rounded edges, so only the rim refracts.
 */
function displacementMap(w: number, h: number, r: number, edge: number) {
  const inner = Math.max(0, r - edge);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>
<linearGradient id="x" x1="100%" y1="0%" x2="0%" y2="0%"><stop offset="0%" stop-color="#000"/><stop offset="100%" stop-color="#f00"/></linearGradient>
<linearGradient id="y" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#000"/><stop offset="100%" stop-color="#00f"/></linearGradient>
<filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${(edge / 2.2).toFixed(1)}"/></filter>
</defs>
<rect width="${w}" height="${h}" fill="#000"/>
<rect width="${w}" height="${h}" rx="${r}" fill="url(#x)"/>
<rect width="${w}" height="${h}" rx="${r}" fill="url(#y)" style="mix-blend-mode:screen"/>
<rect x="${edge}" y="${edge}" width="${w - edge * 2}" height="${h - edge * 2}" rx="${inner}" fill="rgb(128,128,128)" filter="url(#b)"/>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Renders the refraction filter for `target` and returns the inline style
 * that applies it. Re-measures as the element resizes (the map must match).
 */
export function useLiquidGlass(
  target: RefObject<HTMLElement | null>,
  id: string,
  { radius, edge = 22, strength = 70, blur = 12 }: { radius: number; edge?: number; strength?: number; blur?: number },
) {
  const supported = useRefractionSupport();
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = target.current;
    if (!el || !supported) return;
    const ro = new ResizeObserver(([e]) => {
      const box = e.borderBoxSize?.[0];
      const w = Math.round(box ? box.inlineSize : el.offsetWidth);
      const h = Math.round(box ? box.blockSize : el.offsetHeight);
      setSize((s) => (s && s.w === w && s.h === h ? s : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [target, supported]);

  const map = useMemo(
    () => (size ? displacementMap(size.w, size.h, Math.min(radius, size.w / 2, size.h / 2), edge) : null),
    [size, radius, edge],
  );

  const filter =
    supported && size && map ? (
      <svg aria-hidden width="0" height="0" style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}>
        <filter id={id} x="0" y="0" width={size.w} height={size.h} filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feImage href={map} x="0" y="0" width={size.w} height={size.h} preserveAspectRatio="none" result="map" />
          <feDisplacementMap in="SourceGraphic" in2="map" scale={-strength} xChannelSelector="R" yChannelSelector="B" />
        </filter>
      </svg>
    ) : null;

  const style: CSSProperties | undefined =
    supported && size
      ? {
          backdropFilter: `url(#${id}) blur(${blur}px) saturate(185%)`,
          WebkitBackdropFilter: `url(#${id}) blur(${blur}px) saturate(185%)`,
        }
      : undefined;

  return { filter, style };
}

/** Moves the glass's specular highlight to follow the pointer. */
export function trackSpecular(e: React.PointerEvent<HTMLElement>) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty("--lx", `${e.clientX - r.left}px`);
  el.style.setProperty("--ly", `${e.clientY - r.top}px`);
}
