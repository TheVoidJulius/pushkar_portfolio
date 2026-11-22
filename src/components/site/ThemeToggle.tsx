"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

type Theme = "light" | "dark";

type ViewTransitionLike = { ready: Promise<void>; finished: Promise<void>; skipTransition: () => void };
let activeTransition: ViewTransitionLike | null = null;
/** Where the theme is heading while a transition is still applying it. */
let pendingTheme: Theme | null = null;

const DURATION = 720;
const STEPS = 24;

/** Shape of the flood at progress t (0..1): radius and how much its edge ripples. */
function floodAt(t: number, radius: number) {
  const grow = 1 - Math.pow(1 - t, 3); // fast out of the click, easing into the edges
  return { r: grow * radius * 1.12, wobble: Math.pow(1 - t, 1.2), phase: t * 5 };
}

/**
 * The molten blob's outline as a CSS polygon: a circle whose edge ripples.
 * The ripple fades to nothing as it grows, so it settles into a clean circle.
 */
function blob(cx: number, cy: number, r: number, wobble: number, phase: number, n = 96) {
  const pts: string[] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const f =
      1 +
      wobble *
        (0.075 * Math.sin(3 * a + phase * 1.3) + 0.045 * Math.sin(5 * a - phase * 1.7 + 1.1) + 0.028 * Math.sin(8 * a + phase * 2.2 + 2.3));
    const rr = Math.max(0, r * f);
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)}px ${(cy + rr * Math.sin(a)).toFixed(1)}px`);
  }
  return `polygon(${pts.join(",")})`;
}

/**
 * The new theme pours out of the click point as a wobbling liquid blob.
 *
 * Performance note (measured): in a view transition, every extra layer we
 * add (a chrome rim, a droplet splash) costs ~400 ms of one-time setup on a
 * visit's first theme switch, which reads as a freeze. The blob is just an
 * animated clip on the page snapshot, so it stays smooth even the first time.
 */
function runLiquidReveal(root: HTMLElement, x: number, y: number, radius: number) {
  const frames: string[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const { r, wobble, phase } = floodAt(i / STEPS, radius);
    frames.push(blob(x, y, r, wobble, phase));
  }
  root.animate({ clipPath: frames }, { duration: DURATION, easing: "linear", fill: "both", pseudoElement: "::view-transition-new(root)" });
}

/** Flips the theme. Quick repeat clicks each count, even mid-transition. */
export function toggleTheme(origin?: { x: number; y: number }) {
  const current = pendingTheme ?? (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  applyTheme(current === "dark" ? "light" : "dark", origin);
}

/**
 * Switches theme with a liquid-metal reveal expanding from the click point.
 * The browser snapshots the page, so nothing reflows and there is no flicker.
 */
export function applyTheme(next: Theme, origin?: { x: number; y: number }) {
  const root = document.documentElement;
  try {
    localStorage.setItem("theme", next);
  } catch {
    /* storage unavailable — theme still applies for this visit */
  }

  const start = (document as unknown as { startViewTransition?: (cb: () => void) => ViewTransitionLike }).startViewTransition;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    root.dataset.theme = next;
    return;
  }
  if (!start) {
    root.classList.add("theme-transition");
    root.dataset.theme = next;
    window.setTimeout(() => root.classList.remove("theme-transition"), 450);
    return;
  }

  pendingTheme = next;
  activeTransition?.skipTransition();
  // Keyboard activation reports (0, 0): start from the screen's centre instead
  const hasPoint = Boolean(origin && (origin.x || origin.y));
  const x = hasPoint ? origin!.x : innerWidth / 2;
  const y = hasPoint ? origin!.y : innerHeight / 2;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 40;
  root.style.setProperty("--vt-x", `${x}px`);
  root.style.setProperty("--vt-y", `${y}px`);
  root.style.setProperty("--vt-radius", `${radius}px`);
  root.classList.add("theme-reveal");
  // Liquid blob via Web Animations on the transition's pseudo-elements; the
  // CSS circle iris stays as the fallback if that isn't supported.
  const liquid = typeof root.animate === "function";
  if (liquid) root.classList.add("theme-liquid");

  // Fallback path only: the CSS iris's chrome ring, riding the reveal's edge
  const sheen = document.createElement("div");
  sheen.className = "theme-sheen";
  sheen.setAttribute("aria-hidden", "true");

  const transition = start.call(document, () => {
    root.dataset.theme = next;
    if (!liquid) document.body.appendChild(sheen);
  });
  activeTransition = transition;
  // A quick second toggle skips this one, which rejects `ready`. That's expected.
  void transition.ready
    .then(() => {
      if (!liquid) return;
      try {
        runLiquidReveal(root, x, y, radius);
      } catch {
        root.classList.remove("theme-liquid"); // fall back to the CSS iris
      }
    })
    .catch(() => {});
  void transition.finished
    .catch(() => {})
    .finally(() => {
      sheen.remove();
      if (activeTransition !== transition) return;
      activeTransition = null;
      pendingTheme = null;
      root.classList.remove("theme-reveal", "theme-liquid");
    });
}

// The <html data-theme> attribute is the source of truth (set before paint).
function subscribe(onChange: () => void) {
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}
const getTheme = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

export function useTheme() {
  return useSyncExternalStore<Theme | null>(subscribe, getTheme, () => null);
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useTheme();

  // Follow the system preference until the visitor picks a theme explicitly
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => {
      try {
        if (localStorage.getItem("theme")) return;
      } catch {
        /* ignore */
      }
      document.documentElement.dataset.theme = e.matches ? "dark" : "light";
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={(e) => toggleTheme({ x: e.clientX, y: e.clientY })}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Light theme" : "Dark theme"}
      className={`relative grid size-10 place-items-center overflow-hidden rounded-full border border-line text-ink-2 transition hover:border-line-strong hover:text-ink ${className}`}
    >
      <Sun
        className={`absolute size-[18px] transition-all duration-500 ${isDark ? "translate-y-6 rotate-90 opacity-0" : "translate-y-0 opacity-100"}`}
      />
      <Moon
        className={`absolute size-[18px] transition-all duration-500 ${isDark ? "translate-y-0 opacity-100" : "-translate-y-6 -rotate-90 opacity-0"}`}
      />
    </button>
  );
}
