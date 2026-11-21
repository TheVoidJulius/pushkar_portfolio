"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useTheme } from "../site/ThemeToggle";
import type { Expression, MomoRenderer } from "./three/MomoRenderer";

/**
 * A self-contained 3D Momo (one WebGL canvas). Used where a single, fixed
 * Momo is needed (login, admin). The public site uses <MomoFlight/>, a
 * single instance that flies between anchors.
 */
export function MomoHead({
  expression,
  talking = false,
  levelRef,
  className = "",
  trackPointer = true,
  label = "Mikuro, the liquid-chrome cat",
  onReady,
}: {
  expression: Expression;
  talking?: boolean;
  levelRef?: RefObject<number>;
  className?: string;
  trackPointer?: boolean;
  label?: string;
  onReady?: (r: MomoRenderer) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<MomoRenderer | null>(null);
  const [failed, setFailed] = useState(false);
  const theme = useTheme();
  const onReadyRef = useRef(onReady);
  // Latest props, applied as soon as the (lazily loaded) renderer exists
  const propsRef = useRef({ expression, talking, levelRef });
  useEffect(() => {
    onReadyRef.current = onReady;
    propsRef.current = { expression, talking, levelRef };
  }, [onReady, expression, talking, levelRef]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let r: MomoRenderer | null = null;
    let io: IntersectionObserver | null = null;
    let cancelled = false;
    const onVis = () => (document.hidden ? r?.stop() : r?.start());

    void import("./three/MomoRenderer").then(({ MomoRenderer }) => {
      if (cancelled) return;
      try {
        r = new MomoRenderer({
          size: Math.round(Math.max(host.clientWidth, 160)),
          dark: document.documentElement.dataset.theme === "dark",
          reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
        });
      } catch {
        setFailed(true);
        return;
      }
      r.canvas.style.width = "100%";
      r.canvas.style.height = "100%";
      r.canvas.style.display = "block";
      host.appendChild(r.canvas);
      rendererRef.current = r;
      const pr = propsRef.current;
      r.setExpression(pr.expression);
      r.setTalking(pr.talking);
      if (pr.levelRef) r.setLevelRef(pr.levelRef as { current: number });
      onReadyRef.current?.(r);
      io = new IntersectionObserver(([e]) => (e.isIntersecting && !document.hidden ? r?.start() : r?.stop()));
      io.observe(host);
      document.addEventListener("visibilitychange", onVis);
    });

    return () => {
      cancelled = true;
      io?.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      r?.canvas.remove();
      r?.dispose();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    rendererRef.current?.setExpression(expression);
  }, [expression]);
  useEffect(() => {
    rendererRef.current?.setTalking(talking);
  }, [talking]);
  useEffect(() => {
    if (levelRef) rendererRef.current?.setLevelRef(levelRef as { current: number });
  }, [levelRef]);
  useEffect(() => {
    if (theme) rendererRef.current?.setTheme(theme === "dark");
  }, [theme]);

  useEffect(() => {
    if (!trackPointer) return;
    const onMove = (e: PointerEvent) => {
      const host = hostRef.current;
      if (!host || !rendererRef.current) return;
      const b = host.getBoundingClientRect();
      const x = (e.clientX - (b.left + b.width / 2)) / (window.innerWidth * 0.5);
      const y = (e.clientY - (b.top + b.height / 2)) / (window.innerHeight * 0.5);
      rendererRef.current.setPointer(x * 1.4, y * 1.4);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [trackPointer]);

  return (
    <div ref={hostRef} role="img" aria-label={label} className={`relative ${className}`}>
      {failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/momo-avatar.png" alt="" className="h-full w-full object-contain" />
      )}
    </div>
  );
}
