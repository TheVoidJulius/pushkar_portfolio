"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useState } from "react";
import type { Project } from "@/lib/types";
import { MomoLine } from "../momo/MomoLine";
import { FadeUp, SectionPill } from "./Chrome";
import { Cover, ProjectDialog } from "./Projects";

const ease = [0.23, 1, 0.32, 1] as const;

export function Work({ projects, showAssistant }: { projects: Project[]; showAssistant: boolean }) {
  const [active, setActive] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = projects.find((p) => p.id === openId) ?? null;
  const cur = projects[active];
  const [warp, setWarp] = useState({ key: 0, dir: 1 });
  const select = (next: number) => {
    if (next === active) return;
    setWarp((w) => ({ key: w.key + 1, dir: next > active ? 1 : -1 }));
    setActive(next);
  };
  const go = (d: number) => select((active + d + projects.length) % projects.length);

  return (
    <section id="work" aria-labelledby="work-title" className="container-page py-28 md:py-40">
      <div className="flex flex-col items-center gap-14 text-center">
        {showAssistant && <MomoLine id="work" size={104} className="text-left" />}
        <FadeUp>
          <h2 id="work-title">
            <SectionPill n={1}>Projects</SectionPill>
          </h2>
        </FadeUp>
      </div>

      {projects.length === 0 ? (
        <p className="mt-10 text-center text-ink-3">New projects are on their way.</p>
      ) : (
        <>
          {/* Icon carousel */}
          <div
            className="relative mx-auto mt-14 h-[120px] max-w-3xl overflow-hidden [perspective:900px]"
            role="group"
            aria-roledescription="carousel"
            aria-label="Projects"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") go(-1);
              if (e.key === "ArrowRight") go(1);
            }}
          >
            {warp.key > 0 && <span key={warp.key} aria-hidden data-dir={warp.dir} className="warp-streak" />}
            <div className="absolute inset-0 flex items-center justify-center [transform-style:preserve-3d]">
              {projects.map((p, i) => {
                const offset = i - active;
                const dist = Math.abs(offset);
                return (
                  <motion.button
                    key={p.id}
                    type="button"
                    onClick={() => (i === active ? setOpenId(p.id) : select(i))}
                    aria-label={i === active ? `Open ${p.title}` : `Show ${p.title}`}
                    aria-current={i === active}
                    tabIndex={dist > 2 ? -1 : 0}
                    className={`absolute size-16 overflow-hidden rounded-[16px] bg-surface-2 shadow-soft will-change-transform ${i === active ? "chrome-ring" : ""}`}
                    animate={{
                      x: Math.sign(offset) * (Math.min(dist, 1) * 128 + Math.max(dist - 1, 0) * 96),
                      z: -dist * 90,
                      rotateY: Math.max(-58, Math.min(58, -offset * 40)),
                      scale: i === active ? 1.25 : 0.9,
                      opacity: dist > 2 ? 0 : 1 - dist * 0.22,
                    }}
                    transition={{ type: "spring", stiffness: 210, damping: 26, mass: 0.9 }}
                  >
                    <Cover p={p} sizes="80px" />
                  </motion.button>
                );
              })}
            </div>
          </div>

          <div className="mt-6 flex items-center justify-center gap-3">
            <button type="button" onClick={() => go(-1)} aria-label="Previous project" className="grid size-10 place-items-center rounded-full bg-surface-2 transition hover:bg-surface-3">
              <ArrowLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => cur && setOpenId(cur.id)}
              aria-label={cur ? `Open ${cur.title}` : "Open"}
              className="grid size-10 place-items-center rounded-full bg-surface-2 transition hover:bg-surface-3"
            >
              <span className="grid size-[18px] place-items-center rounded-full border-[1.5px] border-ink">
                <span className="size-[8px] rounded-full bg-ink" />
              </span>
            </button>
            <button type="button" onClick={() => go(1)} aria-label="Next project" className="grid size-10 place-items-center rounded-full bg-surface-2 transition hover:bg-surface-3">
              <ArrowRight className="size-4" />
            </button>
          </div>

          <div className="mx-auto mt-8 min-h-[110px] max-w-md text-center" aria-live="polite">
            <AnimatePresence mode="wait">
              {cur && (
                <motion.div
                  key={cur.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }}
                  transition={{ duration: 0.35, ease }}
                >
                  <p>{cur.title}</p>
                  <p className="mt-1 text-ink-3">{cur.summary}</p>
                  {cur.highlight && <p className="mt-3 inline-flex rounded-full bg-accent-soft px-3 py-1 text-[13px] text-accent-text">{cur.highlight}</p>}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* The reel: every project as a panel */}
          <div className="mt-20 grid auto-rows-[220px] grid-cols-2 gap-3 md:grid-cols-4 md:auto-rows-[260px]">
            {projects.map((p, i) => (
              <FadeUp key={p.id} delay={(i % 4) * 0.05} className={p.featured ? "col-span-2 row-span-1 md:row-span-2" : ""}>
                <button
                  type="button"
                  onClick={() => setOpenId(p.id)}
                  className="group relative h-full w-full overflow-hidden rounded-[22px] bg-surface p-3 text-left md:p-4"
                  aria-label={`Open ${p.title}`}
                >
                  <div className="relative h-full w-full overflow-hidden rounded-[14px] bg-surface-2 shadow-sm">
                    <Cover p={p} sizes="(min-width:768px) 50vw, 100vw" />
                  </div>
                  <span className="absolute bottom-6 left-6 rounded-full bg-bg/85 px-3 py-1 text-[13px] opacity-0 backdrop-blur transition duration-300 group-hover:opacity-100 group-focus-visible:opacity-100">
                    {p.title} →
                  </span>
                </button>
              </FadeUp>
            ))}
          </div>
          <FadeUp className="mx-auto mt-10 max-w-sm text-center text-ink-3">
            <p>
              {projects.length} project{projects.length === 1 ? "" : "s"} across {new Set(projects.map((p) => p.category).filter(Boolean)).size || 1}{" "}
              categories. Pick any one for the full story.
            </p>
          </FadeUp>
        </>
      )}

      <AnimatePresence>{open && <ProjectDialog p={open} onClose={() => setOpenId(null)} />}</AnimatePresence>
    </section>
  );
}
