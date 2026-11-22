"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { SkillCategoryWithSkills } from "@/lib/types";
import { useTheme } from "../ThemeToggle";
import { CategoryIcon } from "../icons";
import type { LensRenderer } from "./LensRenderer";
import { LEVEL, LevelBars } from "./SkillsGrid";

const DRAG_THRESHOLD = 6;
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The skills "liquid glass lens" carousel. Each panel is a category, drawn
 * to a canvas texture. Drag, flick, horizontal-wheel or arrow keys to move;
 * click a side panel to bring it to the centre, click the centre one to
 * focus it (the rest drop away and the full list appears as HTML).
 *
 * Vertical wheel and vertical swipes are left alone so the page keeps
 * scrolling through the section.
 */
export function LensCarousel({ categories, onFail }: { categories: SkillCategoryWithSkills[]; onFail: () => void }) {
  const n = categories.length;
  const stageRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const iconsRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const rendererRef = useRef<LensRenderer | null>(null);
  const canvasesRef = useRef<HTMLCanvasElement[]>([]);
  const theme = useTheme();
  const themeRef = useRef(theme);
  const [near, setNear] = useState(false);
  const [ready, setReady] = useState(false);
  const [entered, setEntered] = useState(false);
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState(false);
  const [cursor, setCursor] = useState<"" | "View" | "Close">("");
  const [layout, setLayout] = useState<ReturnType<LensRenderer["focusLayout"]> | null>(null);
  const failRef = useRef(onFail);
  useEffect(() => {
    failRef.current = onFail;
  }, [onFail]);

  // Only create the WebGL context once the section nears the viewport
  useEffect(() => {
    const el = stageRef.current;
    if (!el || near) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: "900px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);

  /** Paints every panel for the current theme; returns lens colours too. */
  const paint = useCallback(async () => {
    const tex = await import("./panelTexture");
    const t = tex.readTheme();
    await tex.loadPanelFonts(t);
    const svgs = Array.from(iconsRef.current?.querySelectorAll("svg") ?? []);
    const icons = await Promise.all(categories.map((_, i) => tex.iconImage(svgs[i] ?? null, t.accentText)));
    canvasesRef.current = categories.map((c, i) => tex.drawPanel(canvasesRef.current[i] ?? document.createElement("canvas"), c, i, n, t, icons[i]));
    const bgHex = tex.toHex(t.bg, "#ffffff");
    return {
      aspect: tex.PANEL_ASPECT,
      colors: {
        bg: tex.hexToRgb(bgHex),
        ring: tex.hexToRgb(tex.toHex(t.accent, "#e0527a")),
        ink: tex.hexToRgb(tex.toHex(t.ink, "#161615")),
        light: !t.dark,
        bgCss: bgHex,
      },
    };
  }, [categories, n]);

  // Build the renderer (Three.js is code-split)
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !near || !n) return;
    let r: LensRenderer | null = null;
    let cancelled = false;
    let ro: ResizeObserver | null = null;
    let vis: IntersectionObserver | null = null;
    let entry: IntersectionObserver | null = null;
    const onVis = () => {
      const rect = host.getBoundingClientRect();
      r?.setVisible(!document.hidden && rect.bottom > 0 && rect.top < innerHeight);
    };

    void (async () => {
      const [{ LensRenderer }, painted] = await Promise.all([import("./LensRenderer"), paint()]);
      if (cancelled) return;
      const coarse = matchMedia("(pointer: coarse)").matches || innerWidth < 768;
      try {
        r = new LensRenderer({ aspect: painted.aspect, samples: coarse ? 10 : 16 });
      } catch {
        failRef.current(); // no WebGL: the plain grid takes over
        return;
      }
      r.onActive = setActive;
      r.onEntryDone = () => setEntered(true);
      r.onFocusChange = (f) => {
        setFocused(f);
        setCursor(""); // the label is refreshed on the next mouse move
        if (f && r) setLayout(r.focusLayout());
      };
      r.onContextLost = () => failRef.current();
      Object.assign(r.canvas.style, { width: "100%", height: "100%", display: "block" });
      r.canvas.setAttribute("aria-hidden", "true");
      host.appendChild(r.canvas);
      rendererRef.current = r;
      const rect = host.getBoundingClientRect();
      r.setSize(rect.width, rect.height);
      r.setColors(painted.colors);
      r.setPanels(canvasesRef.current);
      themeRef.current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
      ro = new ResizeObserver(([e]) => {
        r?.setSize(e.contentRect.width, e.contentRect.height);
        if (r?.focused) setLayout(r.focusLayout());
      });
      ro.observe(host);
      vis = new IntersectionObserver(([e]) => r?.setVisible(e.isIntersecting && !document.hidden));
      vis.observe(host);
      // The entry plays once, when the stage is well into view
      entry = new IntersectionObserver(
        ([e]) => {
          if (!e.isIntersecting) return;
          r?.playEntry();
          entry?.disconnect();
        },
        { threshold: 0.35 },
      );
      entry.observe(host);
      setReady(true);
    })();

    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      ro?.disconnect();
      vis?.disconnect();
      entry?.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      r?.canvas.remove();
      r?.dispose();
      rendererRef.current = null;
      canvasesRef.current = [];
      setReady(false);
      setFocused(false);
    };
  }, [near, n, paint]);

  // Theme switch: repaint the panels and recolour the lens
  useEffect(() => {
    if (!ready || !theme || theme === themeRef.current) return;
    themeRef.current = theme;
    let stale = false;
    void paint().then(({ colors }) => {
      const r = rendererRef.current;
      if (stale || !r) return;
      r.setColors(colors);
      r.refreshTextures();
    });
    return () => {
      stale = true;
    };
  }, [theme, ready, paint]);

  // Wheel: only horizontal intent (or shift+wheel) moves the carousel; a
  // vertical wheel falls through to Lenis and scrolls the page.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !ready) return;
    const onWheel = (e: WheelEvent) => {
      const r = rendererRef.current;
      if (!r) return;
      const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      if (!horizontal && !e.shiftKey) return;
      if (r.locked || r.focused) return;
      e.preventDefault();
      e.stopPropagation(); // keep Lenis from also scrolling the page on shift+wheel
      const unit = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? innerWidth : 1;
      r.wheel((horizontal ? e.deltaX : e.deltaY || e.deltaX) * unit);
    };
    host.addEventListener("wheel", onWheel, { passive: false });
    return () => host.removeEventListener("wheel", onWheel);
  }, [ready]);

  // Focus mode: Escape closes; move keyboard focus into the details
  useEffect(() => {
    if (!focused) return;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        rendererRef.current?.unfocus();
        hostRef.current?.focus({ preventScroll: true });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focused]);

  // Pointer: horizontal drag moves; a tap centres or focuses
  const drag = useRef<{ x: number; y: number; lastX: number; moved: boolean; id: number; dead: boolean } | null>(null);
  const local = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const moveCursor = (e: PointerEvent<HTMLDivElement>) => {
    const c = cursorRef.current;
    if (!c || e.pointerType !== "mouse") return;
    const { x, y } = local(e);
    c.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
    const r = rendererRef.current;
    const hit = r && !r.locked ? r.hit(x, y) : null;
    const next = !hit ? "" : r?.focused ? "Close" : "View";
    setCursor((c0) => (c0 === next ? c0 : next));
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, lastX: e.clientX, moved: false, id: e.pointerId, dead: false };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    moveCursor(e);
    const d = drag.current;
    const r = rendererRef.current;
    if (!d || d.dead || !r) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved) {
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
      // Mostly vertical: not ours (touch scrolls the page via pan-y)
      if (Math.abs(dy) > Math.abs(dx) || !r.dragStart()) {
        d.dead = true;
        return;
      }
      d.moved = true;
      e.currentTarget.setPointerCapture(d.id);
    }
    r.dragMove(e.clientX - d.lastX);
    d.lastX = e.clientX;
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    const r = rendererRef.current;
    if (!d || !r) return;
    if (d.moved) {
      r.dragEnd();
      return;
    }
    if (d.dead || r.locked) return;
    const { x, y } = local(e);
    const hit = r.hit(x, y);
    if (r.focused) {
      r.unfocus();
      return;
    }
    if (!hit) return;
    if (hit.centered) r.focus();
    else r.centerOn(hit.k);
  };
  const onPointerCancel = () => {
    if (drag.current?.moved) rendererRef.current?.dragEnd();
    drag.current = null;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const r = rendererRef.current;
    if (!r) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      if (r.focused) return;
      e.preventDefault();
      r.step(e.key === "ArrowLeft" ? -1 : 1);
    } else if ((e.key === "Enter" || e.key === " ") && !r.focused) {
      e.preventDefault();
      r.focus();
    }
  };

  const cur = categories[active] ?? categories[0];
  const showUi = ready && entered;

  return (
    <div ref={stageRef} className="relative mt-12 w-full md:mt-16">
      {/* Icons rendered once so the panel textures can draw them */}
      <div ref={iconsRef} hidden>
        {categories.map((c) => (
          <CategoryIcon key={c.id} name={c.icon} />
        ))}
      </div>

      {/* Every skill stays in the DOM for screen readers and search engines */}
      <ul className="sr-only">
        {categories.map((c) => (
          <li key={c.id}>
            <h3>
              {c.name} ({c.skills.length} skills)
            </h3>
            {c.description && <p>{c.description}</p>}
            <ul>
              {c.skills.map((s) => (
                <li key={s.id}>
                  {s.name}, {LEVEL[s.level].label}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      <div className="relative h-[clamp(500px,76svh,640px)] overflow-hidden md:h-[clamp(560px,82svh,800px)]">
        <div
          ref={hostRef}
          role="region"
          aria-roledescription="carousel"
          aria-label="Skill categories. Use the arrow keys to browse, Enter to open."
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onPointerLeave={() => setCursor("")}
          className={`absolute inset-0 touch-pan-y select-none outline-none transition-opacity duration-700 focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-inset ${
            ready ? "opacity-100" : "opacity-0"
          } ${cursor ? "cursor-none" : "cursor-grab active:cursor-grabbing"}`}
        />

        <p className="sr-only" aria-live="polite">
          {showUi && cur ? `${cur.name}, ${pad(active + 1)} of ${pad(n)}` : ""}
        </p>

        {/* "View" cursor */}
        <div
          ref={cursorRef}
          aria-hidden
          className={`pointer-events-none absolute top-0 left-0 z-20 grid h-16 min-w-16 place-items-center rounded-full bg-white px-4 text-[13px] text-black mix-blend-exclusion transition-[opacity,scale] duration-300 ${
            cursor ? "scale-100 opacity-100" : "scale-50 opacity-0"
          }`}
        >
          {cursor || "View"}
        </div>

        {/* Title of the centred panel */}
        <div className="pointer-events-none absolute inset-x-0 top-5 flex justify-center md:top-8" aria-hidden>
          <AnimatePresence mode="wait" initial={false}>
            {showUi && !focused && cur && (
              <motion.p
                key={cur.id}
                initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
                transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                className="flex items-center gap-2 rounded-full bg-bg/70 px-3.5 py-1.5 text-[15px] text-ink backdrop-blur"
              >
                <CategoryIcon name={cur.icon} className="size-4 text-accent-text" />
                {cur.name}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* Counter, with buttons for anyone who'd rather not drag */}
        <div
          className={`absolute inset-x-0 bottom-5 flex items-center justify-center gap-2 transition-opacity duration-500 md:bottom-8 ${
            showUi && !focused ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <button
            type="button"
            onClick={() => rendererRef.current?.step(-1)}
            aria-label="Previous category"
            tabIndex={showUi && !focused ? 0 : -1}
            className="grid size-9 place-items-center rounded-full bg-surface-2/80 text-ink-2 backdrop-blur transition hover:bg-surface-3 hover:text-ink"
          >
            <ArrowLeft className="size-4" />
          </button>
          <span className="min-w-[72px] rounded-full bg-surface-2/80 px-3 py-1.5 text-center font-mono text-[12.5px] text-ink-2 tabular-nums backdrop-blur">
            {pad(active + 1)}
            <span className="text-ink-3">/{pad(n)}</span>
          </span>
          <button
            type="button"
            onClick={() => rendererRef.current?.step(1)}
            aria-label="Next category"
            tabIndex={showUi && !focused ? 0 : -1}
            className="grid size-9 place-items-center rounded-full bg-surface-2/80 text-ink-2 backdrop-blur transition hover:bg-surface-3 hover:text-ink"
          >
            <ArrowRight className="size-4" />
          </button>
        </div>

        {/* Focus state: the full list as real HTML */}
        <AnimatePresence>
          {focused && cur && layout && (
            <motion.div
              key="details"
              role="group"
              aria-label={`${cur.name} skills`}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.6, delay: 0.25, ease: [0.23, 1, 0.32, 1] } }}
              exit={{ opacity: 0, y: 16, transition: { duration: 0.25 } }}
              data-lenis-prevent
              className={`absolute z-10 overflow-y-auto overscroll-contain rounded-[22px] border border-line bg-bg-elevated/92 shadow-lift backdrop-blur-xl ${
                layout.sheet ? "inset-x-3 p-5" : "p-6"
              }`}
              style={
                layout.sheet
                  ? { top: layout.bottom + 12, bottom: 12 }
                  : { left: layout.right + 40, top: layout.top, width: layout.listW, maxHeight: layout.bottom - layout.top }
              }
            >
              <p className="label-mono flex items-center gap-2">
                <CategoryIcon name={cur.icon} className="size-3.5 text-accent-text" />
                {pad(active + 1)} / {pad(n)}
              </p>
              <h3 className="mt-3 text-[22px] leading-tight font-semibold tracking-[-0.03em] text-ink">{cur.name}</h3>
              {cur.description && <p className="mt-1.5 text-ink-3">{cur.description}</p>}
              <ul className="mt-5 divide-y divide-line border-y border-line">
                {cur.skills.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-2.5 font-mono text-[13px]">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="text-accent" aria-hidden>
                        ›
                      </span>
                      <span className="truncate text-ink">{s.name}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2.5">
                      <span className="text-[11px] tracking-[0.06em] text-ink-3 uppercase">{LEVEL[s.level].label}</span>
                      <LevelBars level={s.level} />
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-ink-3">
                <span className="text-ink">{cur.skills.length}</span> {cur.skills.length === 1 ? "skill" : "skills"}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Close */}
        <AnimatePresence>
          {focused && (
            <motion.button
              ref={closeRef}
              key="close"
              type="button"
              onClick={() => {
                rendererRef.current?.unfocus();
                hostRef.current?.focus({ preventScroll: true });
              }}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1, transition: { delay: 0.2 } }}
              exit={{ opacity: 0, scale: 0.8 }}
              // Floating top-right; inside the sheet's corner when the list is a sheet
              style={layout?.sheet ? { top: layout.bottom + 24, right: 24 } : undefined}
              className="absolute top-4 right-4 z-20 flex h-10 items-center gap-1.5 rounded-full bg-surface-2/85 pr-4 pl-3 text-[13.5px] text-ink backdrop-blur transition-colors hover:bg-surface-3 md:top-6 md:right-8"
            >
              <X className="size-4" /> Close
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
