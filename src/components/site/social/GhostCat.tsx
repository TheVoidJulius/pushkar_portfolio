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
            <ellipse cx="22" cy="29" rx="16" ry="8.5" />
            <path d="M30 23.5 31.5 17 36 21.5ZM40 21l3.2-4.8.6 6.4Z" />
            <circle cx="34" cy="28" r="6.4" />
            <path d="M31 28q1.3 1.3 2.6 0M35.4 28q1.3 1.3 2.6 0" stroke={line} strokeLinecap="round" fill="none" />
            <path d="M7 30c-2 5 6 8 14 7s10-2 14-3" fill="none" stroke={line} strokeWidth="3" strokeLinecap="round" opacity="0.55" />
            <path className="vc-z" d="M38 12h4l-4 4h4" stroke={line} strokeWidth="1.1" strokeLinecap="round" fill="none" />
          </g>
        </svg>
      </div>
      {name && <span className="vc-name" style={{ color: `hsl(${hue} 55% 30%)` }}>{name}</span>}
    </div>
  );
});

/** Scoped styles (kept here so no global CSS is touched). */
export const CAT_CSS = `
.vc-cat{position:absolute;left:0;top:0;width:44px;height:40px;will-change:transform;pointer-events:none}
.vc-flip{transform:scaleX(var(--face,1));transform-origin:50% 100%;transition:transform .2s}
.vc-svg{display:block;opacity:.82;filter:drop-shadow(0 2px 3px rgba(20,24,40,.22))}
.vc-curl{display:none}
.vc-cat[data-pose=sit] .vc-walk{display:none}
.vc-cat[data-pose=sit] .vc-curl{display:inline}
.vc-cat[data-pose=walk] .vc-flip{animation:vc-bob .34s ease-in-out infinite}
.vc-cat[data-pose=sit] .vc-svg{animation:vc-breathe 3.2s ease-in-out infinite;transform-origin:50% 90%}
.vc-tail{transform-origin:11px 25px;animation:vc-tail 1.6s ease-in-out infinite}
.vc-paw{animation:vc-paw .34s ease-in-out infinite}
.vc-p2{animation-delay:-.17s}
.vc-cat[data-pose=sit] .vc-paw{animation:none}
.vc-z{animation:vc-z 2.6s ease-in-out infinite}
.vc-name{position:absolute;left:50%;top:41px;transform:translateX(-50%);font:600 9px/1 ui-monospace,monospace;letter-spacing:.04em;padding:2px 5px;border-radius:99px;background:rgba(255,255,255,.55);backdrop-filter:blur(4px);white-space:nowrap}
@keyframes vc-bob{0%,100%{transform:scaleX(var(--face,1)) translateY(0)}50%{transform:scaleX(var(--face,1)) translateY(-2px)}}
@keyframes vc-paw{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.8px)}}
@keyframes vc-tail{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(10deg)}}
@keyframes vc-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.04,1.06)}}
@keyframes vc-z{0%,100%{opacity:.2;transform:translateY(1px)}50%{opacity:.9;transform:translateY(-2px)}}
@media (prefers-reduced-motion:reduce){.vc-cat *,.vc-cat{animation:none!important;transition:none!important}}
`;
