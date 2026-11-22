"use client";

import { useMotionValueEvent, useScroll } from "motion/react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { scrollToY } from "@/lib/scroll";
import type { Project } from "@/lib/types";
import type { WarpRenderer } from "./WarpRenderer";

/** Scroll distance per project, in viewport heights. */
const SEGMENT_VH = 72;
const DRAG_THRESHOLD = 6;

/**
 * Scroll progress -> ring position. Each project holds still for a moment
 * (the flat ends of the smoothstep) before the ring turns to the next one,
 * so a card is always readable when the visitor stops scrolling.
 */
function indexFor(progress: number, n: number) {
  if (n < 2) return 0;
  const raw = Math.min(Math.max(progress, 0), 1) * (n - 1);
  const k = Math.min(Math.floor(raw), n - 2);
  const f = raw - k;
  const t = Math.min(1, Math.max(0, (f - 0.16) / 0.68));
  return k + t * t * (3 - 2 * t);
}

/**
 * The pinned warp carousel: scrolling the page turns the ring. Drag, click
 * a side card, or use the arrow keys to move; click the front card (or
 * press Enter) to open the project.
 */
export function WarpProjects({
  projects,
  onOpen,
  onFail,
}: {
  projects: Project[];
  onOpen: (id: string) => void;
  onFail: () => void;
}) {
  const n = projects.length;
  const trackRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<WarpRenderer | null>(null);
  const [active, setActive] = useState(0);
  const [ready, setReady] = useState(false);
  const failRef = useRef(onFail);
  useEffect(() => {
    failRef.current = onFail;
  }, [onFail]);

  const { scrollYProgress } = useScroll({ target: trackRef, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (p) => {
    const i = indexFor(p, n);
    rendererRef.current?.setTarget(i);
    setActive(Math.round(i));
  });

  // Build the renderer and the card textures (Three.js is code-split)
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !n) return;
    let r: WarpRenderer | null = null;
    let cancelled = false;
    let ro: ResizeObserver | null = null;
    let io: IntersectionObserver | null = null;

    // Waits for a quiet moment, so the heavy work never lands on a busy frame
    const idle = (timeout: number) =>
      new Promise<void>((res) =>
        "requestIdleCallback" in window ? requestIdleCallback(() => res(), { timeout }) : setTimeout(res, 16),
      );

    void (async () => {
      // Let the page (and Mikuro's shaders) finish first: a second WebGL context
      // requested while the GPU is still compiling blocks the page for seconds
      await new Promise((res) => setTimeout(res, 2500));
      await idle(1500);
      const [{ WarpRenderer }, { drawProjectCard }] = await Promise.all([import("./WarpRenderer"), import("./cardTexture")]);
      if (cancelled) return;
      try {
        r = new WarpRenderer({ reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches });
      } catch {
        failRef.current(); // no WebGL: the plain project grid takes over
        return;
      }
      await document.fonts?.ready;
      const font = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
      // One card per idle slot instead of all at once (each is a large canvas draw)
      const cards = [];
      for (let i = 0; i < projects.length; i++) {
        if (cancelled) break;
        cards.push(await drawProjectCard(projects[i], i, n, font));
        await idle(150);
      }
      if (cancelled) {
        r.dispose();
        return;
      }
      Object.assign(r.canvas.style, { width: "100%", height: "100%", display: "block" });
      host.appendChild(r.canvas);
      rendererRef.current = r;
      const rect = host.getBoundingClientRect();
      r.setSize(rect.width, rect.height);
      r.setCards(cards);
      r.setTarget(indexFor(scrollYProgress.get(), n), true);
      ro = new ResizeObserver(([e]) => r?.setSize(e.contentRect.width, e.contentRect.height));
      ro.observe(host);
      io = new IntersectionObserver(([e]) => r?.setVisible(e.isIntersecting && !document.hidden));
      io.observe(host);
      setReady(true);
    })();

    const onVis = () => rendererRef.current?.setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      ro?.disconnect();
      io?.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      r?.canvas.remove();
      r?.dispose();
      rendererRef.current = null;
    };
    // scrollYProgress is a stable motion value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, n]);

  /** Scrolls the page so the ring stops on card `k`. */
  const goTo = (k: number, immediate = false) => {
    const track = trackRef.current;
    if (!track || n < 2) return;
    const i = Math.max(0, Math.min(n - 1, k));
    const top = track.getBoundingClientRect().top + window.scrollY;
    const travel = track.offsetHeight - window.innerHeight;
    scrollToY(top + (i / (n - 1)) * travel, immediate);
  };

  // Drag sideways to turn the ring (vertical touch still scrolls the page)
  const drag = useRef<{ x: number; startY: number; moved: boolean; id: number } | null>(null);
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, startY: window.scrollY, moved: false, id: e.pointerId };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const track = trackRef.current;
    if (!d || !track || n < 2) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < DRAG_THRESHOLD) return;
    if (!d.moved) {
      d.moved = true;
      e.currentTarget.setPointerCapture(d.id);
    }
    // Half a screen of drag = one card
    const perCard = (track.offsetHeight - window.innerHeight) / (n - 1);
    scrollToY(d.startY - (dx / (window.innerWidth * 0.5)) * perCard, true);
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) {
      goTo(Math.round(rendererRef.current?.position ?? active)); // settle on the nearest card
      return;
    }
    // A click: the front card opens, a side card comes to the front
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const half = rendererRef.current?.frontHalfWidth ?? 0.3;
    if (Math.abs(x) <= half) onOpen(projects[active].id);
    else goTo(active + (x < 0 ? -1 : 1));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      goTo(active + (e.key === "ArrowLeft" ? -1 : 1));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen(projects[active].id);
    }
  };

  const cur = projects[active];

  return (
    <div ref={trackRef} className="relative mt-10" style={{ height: `calc(100svh + ${(n - 1) * SEGMENT_VH}vh)` }}>
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        <div
          ref={hostRef}
          role="group"
          aria-roledescription="carousel"
          aria-label="Projects. Use the arrow keys to turn, Enter to open."
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (drag.current = null)}
          className={`absolute inset-0 cursor-grab touch-pan-y select-none outline-none transition-opacity duration-700 active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-inset ${
            ready ? "opacity-100" : "opacity-0"
          }`}
        />
        <p className="sr-only" aria-live="polite">
          {cur ? `Project ${active + 1} of ${n}: ${cur.title}. ${cur.summary}` : ""}
        </p>

        {/* Controls, for anyone who'd rather not scroll or drag */}
        <div className="absolute inset-x-0 bottom-[max(76px,calc(env(safe-area-inset-bottom)+60px))] flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => goTo(active - 1)}
            disabled={active === 0}
            aria-label="Previous project"
            className="grid size-10 place-items-center rounded-full bg-surface-2/80 backdrop-blur transition hover:bg-surface-3 disabled:opacity-35"
          >
            <ArrowLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => cur && onOpen(cur.id)}
            className="h-10 min-w-[150px] rounded-full bg-surface-2/80 px-4 text-[13.5px] backdrop-blur transition hover:bg-surface-3"
          >
            <span className="font-mono text-ink-3 tabular-nums">
              {String(active + 1).padStart(2, "0")}/{String(n).padStart(2, "0")}
            </span>{" "}
            Open {cur?.title}
          </button>
          <button
            type="button"
            onClick={() => goTo(active + 1)}
            disabled={active === n - 1}
            aria-label="Next project"
            className="grid size-10 place-items-center rounded-full bg-surface-2/80 backdrop-blur transition hover:bg-surface-3 disabled:opacity-35"
          >
            <ArrowRight className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
