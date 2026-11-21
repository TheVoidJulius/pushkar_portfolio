"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "../site/ThemeToggle";
import { useAssistant } from "./AssistantProvider";
import type { MomoRenderer } from "./three/MomoRenderer";

const BASE = 320; // CSS px of the canvas before scaling
const BUBBLE_GAP = 8;

const damp = (cur: number, target: number, lambda: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));

/**
 * The one and only Mikuro on the public site: a single WebGL canvas that
 * glides between anchors (data-momo-anchor) — the intro spot, each
 * section's line, the chat window, or a small dock in the corner.
 */
export function MomoFlight() {
  const a = useAssistant();
  const theme = useTheme();
  const wrapRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<MomoRenderer | null>(null);
  const [failed, setFailed] = useState(false);
  const { levelRef, lookRef } = a;
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
      r.setLevelRef(levelRef);
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
  }, [levelRef]);

  // Flight loop: ease position & size toward the active anchor every frame
  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pos = { x: -1, y: -1, s: 64, vx: 0, vy: 0 };
    let pointer: [number, number] | null = null;
    let raf = 0;
    let last = performance.now();
    let lastTransform = "";
    const onMove = (e: PointerEvent) => (pointer = [e.clientX, e.clientY]);
    window.addEventListener("pointermove", onMove, { passive: true });

    // First *visible* element with this anchor id (some lines render twice for
    // desktop/mobile). The element is remembered to avoid a DOM query per frame.
    const found = new Map<string, HTMLElement>();
    const rectOf = (id: string) => {
      const known = found.get(id);
      if (known?.isConnected) {
        const r = known.getBoundingClientRect();
        if (r.width > 0) return r;
      }
      for (const el of document.querySelectorAll<HTMLElement>(`[data-momo-anchor="${id}"]`)) {
        const r = el.getBoundingClientRect();
        if (r.width > 0) {
          found.set(id, el);
          return r;
        }
      }
      return null;
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      let target = rectOf(live.current.anchor);
      // If the spot has scrolled away, wait politely in the corner
      if (target && (target.bottom < 0 || target.top > innerHeight)) target = null;
      target ??= rectOf("dock");
      const wrap = wrapRef.current;
      if (!target || !wrap) return;
      const ts = Math.min(target.width, target.height);
      const tx = target.left + (target.width - ts) / 2;
      const ty = target.top + (target.height - ts) / 2;
      if (pos.x < 0) Object.assign(pos, { x: tx, y: ty, s: ts });
      const k = reduce ? 40 : 6;
      const nx = damp(pos.x, tx, k, dt);
      const ny = damp(pos.y, ty, k, dt);
      pos.vx = dt > 0 ? (nx - pos.x) / dt : 0;
      pos.vy = dt > 0 ? (ny - pos.y) / dt : 0;
      pos.x = nx;
      pos.y = ny;
      pos.s = damp(pos.s, ts, reduce ? 40 : 5, dt);
      const transform = `translate3d(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px, 0) scale(${(pos.s / BASE).toFixed(4)})`;
      if (transform !== lastTransform) {
        wrap.style.transform = transform;
        lastTransform = transform;
      }
      if (wrap.style.opacity !== "1") wrap.style.opacity = "1";

      // The speech bubble rides alongside, staying inside the viewport
      const bubble = bubbleRef.current;
      if (bubble) {
        const w = bubble.offsetWidth;
        const h = bubble.offsetHeight;
        const above = pos.y - h - BUBBLE_GAP;
        const bx = Math.max(12, Math.min(innerWidth - w - 12, pos.x + pos.s / 2 - w / 2));
        const by = above > 56 ? above : Math.min(innerHeight - h - 12, pos.y + pos.s + BUBBLE_GAP);
        bubble.style.transform = `translate3d(${bx.toFixed(1)}px, ${by.toFixed(1)}px, 0)`;
      }

      const r = rendererRef.current;
      if (r) {
        r.setDisplaySize(pos.s);
        r.setVelocity(pos.vx, pos.vy);
        const look = lookRef.current;
        if (now < look.until) r.setPointer(look.x, look.y);
        else if (pointer) {
          const cx = pos.x + pos.s / 2;
          const cy = pos.y + pos.s / 2;
          r.setPointer(((pointer[0] - cx) / innerWidth) * 1.8, ((pointer[1] - cy) / innerHeight) * 1.8);
        }
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, [lookRef]);

  const onClick = () => {
    rendererRef.current?.poke();
    a.notice("click");
    if (a.needsSound) return a.enableSound();
    if (a.open) a.poke();
    else a.setOpen(true);
  };

  return (
    <>
      <div
        ref={wrapRef}
        data-mikuro-state={a.state}
        className={`pointer-events-none fixed top-0 left-0 opacity-0 will-change-transform ${a.open ? "z-[56]" : "z-[46]"}`}
        style={{ width: BASE, height: BASE, transformOrigin: "0 0" }}
      >
        <button
          type="button"
          onClick={onClick}
          onPointerEnter={(e) => e.pointerType === "mouse" && a.notice("hover")}
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
      <div ref={bubbleRef} className="mikuro-bubble-anchor pointer-events-none fixed top-0 left-0 z-[47]" aria-live="polite">
        <AnimatePresence>
          {a.quip && !a.open && (
            <motion.p
              key={a.quip.id}
              initial={{ opacity: 0, y: 6, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.97, transition: { duration: 0.14 } }}
              transition={{ type: "spring", stiffness: 420, damping: 30 }}
              className="mikuro-bubble !relative"
            >
              <span className="sr-only">{a.settings.name} says: </span>
              {a.quip.text}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
