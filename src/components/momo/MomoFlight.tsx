"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "../site/ThemeToggle";
import { useAssistant } from "./AssistantProvider";
import type { MomoRenderer } from "./three/MomoRenderer";

const BASE = 320; // CSS px of the canvas before scaling

const damp = (cur: number, target: number, lambda: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));

/**
 * The one and only Momo on the public site: a single WebGL canvas that
 * glides between anchors (data-momo-anchor) — the intro spot, each
 * section's line, the chat window, or a small dock in the corner.
 */
export function MomoFlight() {
  const a = useAssistant();
  const theme = useTheme();
  const wrapRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<MomoRenderer | null>(null);
  const [failed, setFailed] = useState(false);
  const live = useRef({ anchor: a.anchor, expression: a.expression, talking: a.talking });
  useEffect(() => {
    live.current = { anchor: a.anchor, expression: a.expression, talking: a.talking };
    rendererRef.current?.setExpression(a.expression);
    rendererRef.current?.setTalking(a.talking);
  }, [a.anchor, a.expression, a.talking]);

  useEffect(() => {
    if (theme) rendererRef.current?.setTheme(theme === "dark");
  }, [theme]);

  // Create the renderer lazily (Three.js is code-split)
  useEffect(() => {
    let r: MomoRenderer | null = null;
    let cancelled = false;
    void import("./three/MomoRenderer").then(({ MomoRenderer }) => {
      if (cancelled || !hostRef.current) return;
      try {
        r = new MomoRenderer({
          size: BASE,
          dark: document.documentElement.dataset.theme === "dark",
          reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
        });
      } catch {
        setFailed(true);
        return;
      }
      Object.assign(r.canvas.style, { width: "100%", height: "100%", display: "block" });
      hostRef.current.appendChild(r.canvas);
      r.setLevelRef(a.levelRef);
      r.setExpression(live.current.expression);
      r.setTalking(live.current.talking);
      rendererRef.current = r;
      r.start();
    });
    const onVis = () => (document.hidden ? rendererRef.current?.stop() : rendererRef.current?.start());
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      r?.canvas.remove();
      r?.dispose();
      rendererRef.current = null;
    };
  }, [a.levelRef]);

  // Flight loop: ease position & size toward the active anchor every frame
  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pos = { x: -1, y: -1, s: 64, vx: 0, vy: 0 };
    let pointer: [number, number] | null = null;
    let raf = 0;
    let last = performance.now();
    const onMove = (e: PointerEvent) => (pointer = [e.clientX, e.clientY]);
    window.addEventListener("pointermove", onMove, { passive: true });

    // First *visible* element with this anchor id (some lines render twice
    // for desktop/mobile and one copy is hidden)
    const rectOf = (id: string) => {
      for (const el of document.querySelectorAll<HTMLElement>(`[data-momo-anchor="${id}"]`)) {
        const r = el.getBoundingClientRect();
        if (r.width > 0) return r;
      }
      return null;
    };

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      let target = rectOf(live.current.anchor);
      // If her spot has scrolled away, wait politely in the corner
      if (target && (target.bottom < 0 || target.top > innerHeight)) target = null;
      target ??= rectOf("dock");
      const wrap = wrapRef.current;
      if (target && wrap) {
        const ts = Math.min(target.width, target.height);
        const tx = target.left + (target.width - ts) / 2;
        const ty = target.top + (target.height - ts) / 2;
        if (pos.x < 0) Object.assign(pos, { x: tx, y: ty, s: ts });
        const k = reduce ? 40 : 5;
        const nx = damp(pos.x, tx, k, dt);
        const ny = damp(pos.y, ty, k, dt);
        pos.vx = dt > 0 ? (nx - pos.x) / dt : 0;
        pos.vy = dt > 0 ? (ny - pos.y) / dt : 0;
        pos.x = nx;
        pos.y = ny;
        pos.s = damp(pos.s, ts, reduce ? 40 : 4.5, dt);
        wrap.style.transform = `translate3d(${pos.x.toFixed(2)}px, ${pos.y.toFixed(2)}px, 0) scale(${(pos.s / BASE).toFixed(4)})`;
        wrap.style.opacity = "1";
        const r = rendererRef.current;
        if (r) {
          r.setVelocity(pos.vx, pos.vy);
          const cx = pos.x + pos.s / 2;
          const cy = pos.y + pos.s / 2;
          if (pointer) r.setPointer(((pointer[0] - cx) / innerWidth) * 1.8, ((pointer[1] - cy) / innerHeight) * 1.8);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  const onClick = () => {
    rendererRef.current?.poke();
    if (a.needsSound) return a.enableSound();
    if (a.open) a.poke();
    else a.setOpen(true);
  };

  return (
    <div
      ref={wrapRef}
      className={`pointer-events-none fixed top-0 left-0 opacity-0 will-change-transform ${a.open ? "z-[56]" : "z-[46]"}`}
      style={{ width: BASE, height: BASE, transformOrigin: "0 0" }}
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={a.needsSound ? `Turn on ${a.settings.name}'s voice` : a.open ? `Pet ${a.settings.name}` : `Chat with ${a.settings.name}`}
        className="pointer-events-auto absolute inset-[8%] cursor-pointer rounded-full"
      />
      <div ref={hostRef} className="pointer-events-none relative h-full w-full" aria-hidden>
        {failed && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/momo-avatar.png" alt="" className="h-full w-full object-contain" />
        )}
      </div>
    </div>
  );
}
