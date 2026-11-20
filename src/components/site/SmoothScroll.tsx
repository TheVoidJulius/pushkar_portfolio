"use client";

import Lenis from "lenis";
import { useEffect } from "react";
import { setLenis } from "@/lib/scroll";

/** Lenis smooth scrolling (disabled for reduced-motion users). */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
    setLenis(lenis);
    let raf = 0;
    const loop = (t: number) => {
      lenis.raf(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    // honour an initial #hash
    if (location.hash) {
      const el = document.querySelector(location.hash);
      if (el) setTimeout(() => lenis.scrollTo(el as HTMLElement, { offset: -80, immediate: true }), 50);
    }
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
      setLenis(null);
    };
  }, []);
  return null;
}
