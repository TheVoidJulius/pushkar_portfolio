"use client";

import { AnimatePresence, useReducedMotion } from "motion/react";
import { useCallback, useState } from "react";
import type { Project } from "@/lib/types";
import { MomoLine } from "../momo/MomoLine";
import { FadeUp, SectionPill } from "./Chrome";
import { Cover, ProjectDialog } from "./Projects";
import { WarpProjects } from "./warp/WarpProjects";

export function Work({ projects, showAssistant }: { projects: Project[]; showAssistant: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const closeDialog = useCallback(() => setOpenId(null), []);
  const open = projects.find((p) => p.id === openId) ?? null;
  // The warp carousel needs WebGL and motion; otherwise a calm grid shows the same projects
  const reduce = useReducedMotion();
  const [warpFailed, setWarpFailed] = useState(false);
  const onWarpFail = useCallback(() => setWarpFailed(true), []);
  const useWarp = !reduce && !warpFailed;

  return (
    <section id="work" aria-labelledby="work-title" className="pt-28 md:pt-40">
      <div className="container-page flex flex-col items-center gap-14 text-center">
        {showAssistant && <MomoLine id="work" size={104} className="text-left" />}
        <FadeUp>
          <h2 id="work-title">
            <SectionPill n={1}>Projects</SectionPill>
          </h2>
        </FadeUp>
      </div>

      {projects.length === 0 ? (
        <p className="container-page mt-10 pb-28 text-center text-ink-3 md:pb-40">New projects are on their way.</p>
      ) : useWarp ? (
        <WarpProjects projects={projects} onOpen={setOpenId} onFail={onWarpFail} />
      ) : (
        <ProjectGrid projects={projects} onOpen={setOpenId} />
      )}

      <AnimatePresence>{open && <ProjectDialog p={open} onClose={closeDialog} />}</AnimatePresence>
    </section>
  );
}

/** Every project as a panel. Used without WebGL or with reduced motion. */
function ProjectGrid({ projects, onOpen }: { projects: Project[]; onOpen: (id: string) => void }) {
  return (
    <div className="container-page pb-28 md:pb-40">
      <div className="mt-14 grid auto-rows-[220px] grid-cols-2 gap-3 md:grid-cols-4 md:auto-rows-[260px]">
        {projects.map((p, i) => (
          <FadeUp key={p.id} delay={(i % 4) * 0.05} className={p.featured ? "col-span-2 row-span-1 md:row-span-2" : ""}>
            <button
              type="button"
              onClick={() => onOpen(p.id)}
              className="group relative h-full w-full overflow-hidden rounded-[22px] bg-surface p-3 text-left md:p-4"
              aria-label={`Open ${p.title}`}
            >
              <div className="relative h-full w-full overflow-hidden rounded-[14px] bg-surface-2 shadow-sm">
                <Cover p={p} sizes="(min-width:768px) 50vw, 100vw" />
              </div>
              <span className="absolute bottom-6 left-6 rounded-full bg-bg/85 px-3 py-1 text-[13px] opacity-100 backdrop-blur transition duration-300 md:opacity-0 md:group-hover:opacity-100 md:group-focus-visible:opacity-100">
                {p.title} →
              </span>
            </button>
          </FadeUp>
        ))}
      </div>
    </div>
  );
}
