import { forwardRef, useId } from "react";

/**
 * One tiny translucent chrome-ish ghost cat, pure SVG + CSS (no canvas).
 * The parent loop sets `data-pose` ("walk" | "sit"), `data-face` ("1" | "-1")
 * and the element's transform; everything else is declarative.
 */
export const GhostCat = forwardRef<HTMLDivElement, { hue: number; name?: string }>(function GhostCat({ hue, name }, ref) {
  const id = useId().replace(/:/g, "");
  const light = `hsl(${hue} 85% 94%)`;
  const mid = `hsl(${hue} 55% 76%)`;
  const dark = `hsl(${hue} 35% 48%)`;
  const line = `hsl(${hue} 45% 32%)`;
  return (
    <div ref={ref} data-pose="walk" className="vc-cat" aria-hidden>
      <div className="vc-flip">
        <svg viewBox="0 0 44 40" width="44" height="40" className="vc-svg" fill="none">
          <defs>
            <linearGradient id={`g${id}`} x1="0" y1="0" x2="0.4" y2="1">
              <stop offset="0" stopColor={light} />
              <stop offset="0.5" stopColor={mid} />
              <stop offset="1" stopColor={dark} />
            </linearGradient>
          </defs>
          {/* walking */}
          <g className="vc-walk" fill={`url(#g${id})`} stroke={line} strokeWidth="1.2" strokeLinejoin="round">
            <path className="vc-tail" d="M11 25c-6-1-8-8-4-11" strokeLinecap="round" fill="none" strokeWidth="2.6" />
            <ellipse className="vc-paw vc-p1" cx="15" cy="34" rx="3" ry="2.2" />
            <ellipse className="vc-paw vc-p2" cx="21" cy="34" rx="3" ry="2.2" />
            <ellipse className="vc-paw vc-p2" cx="28" cy="34" rx="3" ry="2.2" />
            <ellipse className="vc-paw vc-p1" cx="33" cy="34" rx="3" ry="2.2" />
            <ellipse cx="23" cy="27" rx="13" ry="7.5" />
            <path d="M28 14 29.5 7 34 11.5ZM38 11.5 42 7l.8 7.5Z" />
            <circle cx="35" cy="18" r="7.5" />
            <circle cx="37.6" cy="17" r="1" fill={line} stroke="none" />
            <circle cx="32.2" cy="17" r="1" fill={line} stroke="none" />
            <path d="M34.2 20.4h1.4" stroke={line} strokeLinecap="round" />
          </g>
          {/* curled up asleep */}
          <g className="vc-curl" fill={`url(#g${id})`} stroke={line} strokeWidth="1.2" strokeLinejoin="round">
