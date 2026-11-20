"use client";

import { AnimatePresence, motion, useMotionValueEvent, useScroll, useSpring, useTransform } from "motion/react";
import Image from "next/image";
import { useRef, useState } from "react";
import type { Experience } from "@/lib/types";
import { MomoLine } from "../momo/MomoLine";
import { SectionPill } from "./Chrome";

const STEP = 26; // degrees between companies on the dial
const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

/**
 * Scroll-driven dial: the ring rotates as you scroll, bringing each
 * company to the pointer at the top while the card in the middle updates.
 */
export function ExperienceDial({ items, showAssistant }: { items: Experience[]; showAssistant: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const n = Math.max(1, items.length);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const smooth = useSpring(scrollYProgress, { stiffness: 90, damping: 24, mass: 0.6 });
  const rotate = useTransform(smooth, [0.08, 0.92], [0, -(n - 1) * STEP]);
  const [active, setActive] = useState(0);
  useMotionValueEvent(smooth, "change", (v) => {
    const p = Math.min(1, Math.max(0, (v - 0.08) / 0.84));
    setActive(Math.round(p * (n - 1)));
  });
  const cur = items[active];

  // Ticks every 2°, longer every 10°
  const ticks = Array.from({ length: 180 }, (_, i) => i * 2);

  return (
    <section id="experience" ref={ref} aria-labelledby="experience-title" style={{ height: `${120 + n * 55}vh` }} className="relative">
      <div className="sticky top-0 flex h-[100svh] flex-col items-center overflow-hidden">
        <h2 id="experience-title" className="mt-[11vh] shrink-0">
          <SectionPill n={3}>Experience</SectionPill>
        </h2>

        {/* The dial */}
        <div className="pointer-events-none absolute top-[22vh] left-1/2 aspect-square w-[max(150vw,900px)] -translate-x-1/2 md:w-[min(1500px,104vw)]">
          <div className="absolute inset-0 rounded-full bg-surface" />
          <motion.svg viewBox="0 0 1000 1000" className="absolute inset-0 h-full w-full" style={{ rotate }} aria-hidden>
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
          </motion.svg>
          {/* fixed pointer */}
          <span className="absolute top-[-1.6%] left-1/2 h-[3.4%] w-[1.5px] -translate-x-1/2 bg-ink" />
        </div>

        {/* Centre content (does not rotate) */}
        <div className="relative z-10 mt-[17vh] flex w-full max-w-[640px] flex-col items-center px-5">
          {showAssistant && <MomoLine id="experience" size={84} />}
          <div className="mt-8 w-full">
            <AnimatePresence mode="wait">
              {cur && (
                <motion.article
                  key={cur.id}
                  initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -10, filter: "blur(6px)", transition: { duration: 0.18 } }}
                  transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
                  className="rounded-[20px] bg-bg-elevated p-5 shadow-soft md:p-6"
                >
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
                </motion.article>
              )}
            </AnimatePresence>
          </div>

          <div className="mt-8 flex flex-col items-center gap-2 text-center">
            <p className="text-ink-3">Where I&apos;ve worked</p>
            <AnimatePresence mode="wait">
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
                  <span className="text-[19px] font-semibold tracking-[-0.03em]">{cur.company}</span>
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
