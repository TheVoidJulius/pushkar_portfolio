"use client";

import type Lenis from "lenis";

let lenis: Lenis | null = null;
export const setLenis = (l: Lenis | null) => {
  lenis = l;
};

/** Smoothly scrolls to a section id (uses Lenis when active). */
export function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // `force`: Lenis ignores scrollTo while stopped, and the menu stops it while
  // open. Its links scroll in the same tick the menu closes, before it restarts.
  if (lenis && !reduce) lenis.scrollTo(el, { offset: -80, duration: 1.2, force: true });
  else el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  history.replaceState(null, "", id === "hero" ? location.pathname : `#${id}`);
}

/** Scrolls the page to an absolute position (smoothly unless `immediate`). */
export function scrollToY(y: number, immediate = false) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (lenis) lenis.scrollTo(y, { immediate: immediate || reduce, duration: 0.9, force: true });
  else window.scrollTo({ top: y, behavior: immediate || reduce ? "auto" : "smooth" });
}

/** Pauses smooth scrolling (and page scroll) while a modal is open. */
export function lockScroll(locked: boolean) {
  if (locked) lenis?.stop();
  else lenis?.start();
  document.documentElement.style.overflow = locked ? "hidden" : "";
}
