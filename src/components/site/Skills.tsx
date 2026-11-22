"use client";

import { useReducedMotion } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import type { SkillCategoryWithSkills } from "@/lib/types";
import { MomoLine } from "../momo/MomoLine";
import { FadeUp, SectionPill } from "./Chrome";
import { LensCarousel } from "./skills/LensCarousel";
import { SkillsGrid } from "./skills/SkillsGrid";

export function Skills({ categories, showAssistant }: { categories: SkillCategoryWithSkills[]; showAssistant: boolean }) {
  const cats = useMemo(() => categories.filter((c) => c.skills.length), [categories]);
  const reduce = useReducedMotion();
  const [lensFailed, setLensFailed] = useState(false);
  const onLensFail = useCallback(() => setLensFailed(true), []);
  const useLens = !reduce && !lensFailed;

  return (
    <section id="skills" aria-labelledby="skills-title" className="py-28 md:py-40">
      <div className="container-page flex flex-col items-center gap-14 text-center">
        {showAssistant && <MomoLine id="skills" size={100} className="text-left" />}
        <FadeUp>
          <h2 id="skills-title">
            <SectionPill n={2}>Skills</SectionPill>
          </h2>
        </FadeUp>
        <FadeUp delay={0.05}>
          <p className="max-w-md text-ink-3">
            <span className="text-ink">What I build with.</span> Grouped by craft, with how deep each one goes.
          </p>
        </FadeUp>
      </div>

      {cats.length === 0 ? (
        <p className="container-page mt-10 text-center text-ink-3">Skills will appear here soon.</p>
      ) : useLens ? (
        <LensCarousel categories={cats} onFail={onLensFail} />
      ) : (
        <SkillsGrid categories={cats} />
      )}
    </section>
  );
}
