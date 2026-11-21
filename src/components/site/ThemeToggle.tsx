"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

type Theme = "light" | "dark";

type ViewTransitionLike = { ready: Promise<void>; finished: Promise<void>; skipTransition: () => void };
let activeTransition: ViewTransitionLike | null = null;
/** Where the theme is heading while a transition is still applying it. */
let pendingTheme: Theme | null = null;

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

  // Exists only in the "after" snapshot: the chrome ring riding the reveal's edge
  const sheen = document.createElement("div");
  sheen.className = "theme-sheen";
  sheen.setAttribute("aria-hidden", "true");

  const transition = start.call(document, () => {
    root.dataset.theme = next;
    document.body.appendChild(sheen);
  });
  activeTransition = transition;
  // A quick second toggle skips this one, which rejects `ready`. That's expected.
  void transition.ready.catch(() => {});
  void transition.finished
    .catch(() => {})
    .finally(() => {
      sheen.remove();
      if (activeTransition !== transition) return;
      activeTransition = null;
      pendingTheme = null;
      root.classList.remove("theme-reveal");
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
