"use client";

import {
  AnimatePresence,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Experience } from "@/lib/types";
import { MomoLine } from "../momo/MomoLine";
import { SectionPill } from "./Chrome";

const STEP = 26; // degrees between companies on the dial
const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const ease = [0.23, 1, 0.32, 1] as const;

// The role card warps through a wide lens as it changes, in the direction of travel
const cardWarp = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 70, scaleX: 1.28, scaleY: 0.9, skewX: -dir * 9, filter: "blur(10px)" }),
  center: { opacity: 1, x: 0, scaleX: 1, scaleY: 1, skewX: 0, filter: "blur(0px)" },
  exit: (dir: number) => ({
    opacity: 0,
    x: -dir * 70,
    scaleX: 1.22,
    scaleY: 0.92,
    skewX: dir * 9,
    filter: "blur(8px)",
    transition: { duration: 0.2, ease: "easeIn" as const },
  }),
};

/** The dial's ticks and company names. Drawn once, reused by the chromatic ghost layers. */
function DialFace({ items, active }: { items: Experience[]; active: number }) {
  // Ticks every 2°, longer every 10°
  const ticks = useMemo(() => Array.from({ length: 180 }, (_, i) => i * 2), []);
  return (
    <>
      {ticks.map((deg) => {
        const long = deg % 10 === 0;
        return (
          <line
            key={deg}
            x1="500"
            y1="14"
            x2="500"
            y2={long ? 30 : 22}
            stroke="currentColor"
            strokeWidth={long ? 1.4 : 1}
            className="text-ink-3/50"
            transform={`rotate(${deg} 500 500)`}
          />
        );
      })}
      {items.map((e, i) => (
        <g key={e.id} transform={`rotate(${i * STEP} 500 500)`}>
          <line x1="500" y1="10" x2="500" y2="40" stroke="currentColor" strokeWidth="2.2" className={i === active ? "text-ink" : "text-ink-3"} />
          <text
            x="500"
            y="62"
            textAnchor="middle"
            className={`transition-[fill] duration-300 ${i === active ? "fill-ink" : "fill-ink-3"}`}
            style={{ fontSize: 13, letterSpacing: "-0.01em" }}
          >
            {e.company}
          </text>
        </g>
      ))}
    </>
  );
}

/**
 * Scroll-driven dial: the ring rotates as you scroll, bringing each
 * company to the pointer at the top while the card in the middle updates.
 * Every move runs through a chrome warp: the faster the dial turns, the
 * more it splits into cyan/magenta ghosts, its rim lights up and lens flares
 * bloom at the edges; each new role warps in through the lens.
 */
export function ExperienceDial({ items, showAssistant }: { items: Experience[]; showAssistant: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const n = Math.max(1, items.length);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const smooth = useSpring(scrollYProgress, { stiffness: 90, damping: 24, mass: 0.6 });
  const rotate = useTransform(smooth, [0.08, 0.92], [0, -(n - 1) * STEP]);

  // Warp intensity (0..1) and chromatic ghost offset (degrees), from how fast
  // the dial turns. Measured in our own frame loop: it attacks fast, releases
  // gently and returns exactly to 0 at rest (Motion's useVelocity can stall
  // on a non-zero value once scrolling stops, leaving the glow lit).
  const warp = useMotionValue(0);
  const lag = useMotionValue(0);
  useEffect(() => {
    if (reduce) return;
    let raf = 0;
    let running = false;
    let prevVal = rotate.get();
    let prevT = performance.now();
    let frameT = 0;
    let vel = 0; // degrees per second, smoothed
    let w = 0;
    // Speed is measured when the dial actually moves...
    const onChange = (v: number) => {
      const now = performance.now();
      const dt = Math.max(0.004, (now - prevT) / 1000);
      const inst = (v - prevVal) / dt;
      prevVal = v;
      prevT = now;
      vel += (inst - vel) * (1 - Math.exp(-dt * 18));
      if (!running) {
        running = true;
        frameT = now;
        raf = requestAnimationFrame(loop);
      }
    };
    // ...and this loop eases the effect in and out between moves
    const loop = (now: number) => {
      const dt = Math.min(0.1, Math.max(0.001, (now - frameT) / 1000));
      frameT = now;
      const idle = now - prevT;
      if (idle > 50) vel *= Math.exp(-dt * 10); // stopped moving: let the speed fall away
      const target = Math.min(1, Math.abs(vel) / 22);
      w += (target - w) * (1 - Math.exp(-dt * (target > w ? 14 : 4.5)));
      warp.set(w);
      // Ghosts trail/lead the ring by ~140ms of its motion
      lag.set(Math.max(-6, Math.min(6, vel * 0.14)));
      if (idle > 120 && Math.abs(vel) < 0.05 && w < 0.004) {
        vel = w = 0;
        warp.set(0);
        lag.set(0);
        running = false;
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    const unsubscribe = rotate.on("change", onChange);
    return () => {
      unsubscribe();
      cancelAnimationFrame(raf);
    };
  }, [rotate, reduce, warp, lag]);
  const ghostA = useTransform(() => rotate.get() + lag.get());
  const ghostB = useTransform(() => rotate.get() - lag.get() * 0.6);
  const ghostOpacity = useTransform(warp, [0, 1], [0, 0.9]);
  const rimOpacity = useTransform(warp, [0, 1], [0, 1]);
  const flareOpacity = useTransform(warp, [0, 0.15, 1], [0, 0.25, 1]);
  const flareScale = useTransform(warp, [0, 1], [0.75, 1.15]);

  const [active, setActive] = useState(0);
  const [dir, setDir] = useState(1);
  const [warpKey, setWarpKey] = useState(0);
  useMotionValueEvent(smooth, "change", (v) => {
    const p = Math.min(1, Math.max(0, (v - 0.08) / 0.84));
    const next = Math.round(p * (n - 1));
    if (next !== active) {
      setDir(next > active ? 1 : -1);
      setWarpKey((k) => k + 1);
      setActive(next);
    }
  });
  const cur = items[active];
  const effects = !reduce;

  return (
    <section id="experience" ref={ref} aria-labelledby="experience-title" style={{ height: `${120 + n * 55}vh` }} className="relative">
      <div className="sticky top-0 flex h-[100svh] flex-col items-center overflow-hidden">
        {/* Lens glows and side flares, lit by the dial's speed */}
        {effects && (
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <motion.span className="chrome-glow chrome-glow-top" style={{ opacity: flareOpacity, scaleX: flareScale }} />
            <motion.span className="chrome-glow chrome-glow-bottom" style={{ opacity: flareOpacity, scaleX: flareScale }} />
            <motion.span className="chrome-flare chrome-flare-left" style={{ opacity: flareOpacity, scaleY: flareScale }} />
            <motion.span className="chrome-flare chrome-flare-right" style={{ opacity: flareOpacity, scaleY: flareScale }} />
          </div>
        )}

        <h2 id="experience-title" className="relative mt-[11vh] shrink-0">
          <SectionPill n={3}>Experience</SectionPill>
        </h2>

        {/* The dial */}
        <div className="pointer-events-none absolute top-[22vh] left-1/2 aspect-square w-[max(150vw,900px)] -translate-x-1/2 md:w-[min(1500px,104vw)]">
          <div className="absolute inset-0 rounded-full bg-surface" />
          {effects && <motion.div aria-hidden className="chrome-rim absolute inset-0 rounded-full" style={{ opacity: rimOpacity }} />}
          {effects && (
            <>
              <motion.svg
                viewBox="0 0 1000 1000"
                className="dial-ghost dial-ghost-cyan absolute inset-0 h-full w-full will-change-transform"
                style={{ rotate: ghostA, opacity: ghostOpacity }}
                aria-hidden
              >
                <DialFace items={items} active={active} />
              </motion.svg>
              <motion.svg
                viewBox="0 0 1000 1000"
                className="dial-ghost dial-ghost-magenta absolute inset-0 h-full w-full will-change-transform"
                style={{ rotate: ghostB, opacity: ghostOpacity }}
                aria-hidden
              >
                <DialFace items={items} active={active} />
              </motion.svg>
            </>
          )}
          <motion.svg viewBox="0 0 1000 1000" className="absolute inset-0 h-full w-full will-change-transform" style={{ rotate }} aria-hidden>
            <DialFace items={items} active={active} />
          </motion.svg>
          {/* fixed pointer */}
          <span className="absolute top-[-1.6%] left-1/2 h-[3.4%] w-[1.5px] -translate-x-1/2 bg-ink" />
        </div>

        {/* Centre content (does not rotate) */}
        <div className="relative z-10 mt-[17vh] flex w-full max-w-[640px] flex-col items-center px-5">
          {showAssistant && <MomoLine id="experience" size={108} />}
          <div className="mt-8 w-full [perspective:900px]">
            <AnimatePresence mode="wait" custom={dir} initial={false}>
              {cur && (
                <motion.article
                  key={cur.id}
                  custom={dir}
                  variants={effects ? cardWarp : undefined}
                  initial={effects ? "enter" : { opacity: 0 }}
                  animate={effects ? "center" : { opacity: 1 }}
                  exit={effects ? "exit" : { opacity: 0 }}
                  transition={{ duration: 0.5, ease }}
                  className="relative overflow-hidden rounded-[20px] bg-bg-elevated p-5 shadow-soft md:p-6"
                >
                  {effects && warpKey > 0 && <span key={warpKey} aria-hidden data-dir={dir} className="warp-streak chrome-streak" />}
                  <div key={`c${warpKey}`} className={effects && warpKey > 0 ? "chroma-split" : undefined}>
                    <p className="font-mono text-[12px] text-ink-3">
                      {fmt(cur.start_date)} — {cur.is_current ? "Now" : cur.end_date ? fmt(cur.end_date) : ""}
                      {cur.location ? ` · ${cur.location}` : ""}
                    </p>
                    <h3 className="mt-2">
                      {cur.role} <span className="text-ink-3">at {cur.company}</span>
                    </h3>
                    {cur.description && <p className="mt-2 text-ink-3">{cur.description}</p>}
                    {cur.achievements.length > 0 && (
                      <ul className="mt-3 space-y-1">
                        {cur.achievements.slice(0, 3).map((a) => (
                          <li key={a} className="flex gap-2 text-[14px] text-ink-2">
                            <span className="text-accent">•</span>
                            {a}
                          </li>
                        ))}
                      </ul>
                    )}
                    {cur.technologies.length > 0 && (
                      <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Technologies">
                        {cur.technologies.map((t) => (
                          <li key={t} className="chip chip-mono">
                            {t}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </motion.article>
              )}
            </AnimatePresence>
          </div>

          <div className="mt-8 flex flex-col items-center gap-2 text-center">
            <p className="text-ink-3">Where I&apos;ve worked</p>
            <AnimatePresence mode="wait" custom={dir} initial={false}>
              {cur && (
                <motion.div
                  key={cur.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3 }}
                  className="flex items-center gap-2.5"
                >
                  {cur.logo_url && (
                    <span className="relative size-7 overflow-hidden rounded-lg">
                      <Image src={cur.logo_url} alt="" fill sizes="28px" className="object-cover" unoptimized={cur.logo_url.endsWith(".svg")} />
                    </span>
                  )}
                  <span className={`text-[19px] font-semibold tracking-[-0.03em] ${effects && warpKey > 0 ? "chroma-split" : ""}`} key={`n${warpKey}`}>
                    {cur.company}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {items.length === 0 && <p className="relative z-10 mt-[30vh] text-ink-3">Experience entries will appear here soon.</p>}
      </div>
    </section>
  );
}
