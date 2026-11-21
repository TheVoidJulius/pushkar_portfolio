"use client";

import type { SkillCategoryWithSkills, SkillLevel } from "@/lib/types";
import { MomoLine } from "../momo/MomoLine";
import { FadeUp, SectionPill } from "./Chrome";
import { CategoryIcon } from "./icons";

const LEVEL: Record<SkillLevel, { label: string; bars: number }> = {
  expert: { label: "Expert", bars: 3 },
  proficient: { label: "Proficient", bars: 2 },
  familiar: { label: "Familiar", bars: 1 },
};

export function Skills({ categories, showAssistant }: { categories: SkillCategoryWithSkills[]; showAssistant: boolean }) {
  const cats = categories.filter((c) => c.skills.length);
  return (
    <section id="skills" aria-labelledby="skills-title" className="container-page py-28 md:py-40">
      <div className="flex flex-col items-center gap-14 text-center">
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
        <p className="mt-10 text-center text-ink-3">Skills will appear here soon.</p>
      ) : (
        <ul className="mt-16 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {cats.map((c, i) => (
            <li key={c.id} className="flex flex-col">
              <FadeUp delay={i * 0.06} className="flex h-full flex-col">
                {/* panel with a little "terminal sheet" of the skills */}
                <div className="flex aspect-[4/3] items-center justify-center rounded-[20px] bg-surface p-5">
                  <div className="w-full rounded-[10px] bg-bg-elevated p-3.5 shadow-soft">
                    <p className="mb-2 flex items-center gap-1.5 font-mono text-[10.5px] text-ink-3">
                      <CategoryIcon name={c.icon} className="size-3" /> {c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
                    </p>
                    <ul className="space-y-1">
                      {c.skills.slice(0, 6).map((s) => (
                        <li key={s.id} className="flex items-center justify-between gap-2 font-mono text-[11px]">
                          <span className="truncate">{s.name}</span>
                          <span className="flex gap-0.5" aria-label={LEVEL[s.level].label}>
                            {[1, 2, 3].map((b) => (
                              <span key={b} className={`h-1.5 w-2.5 rounded-sm ${b <= LEVEL[s.level].bars ? "bg-accent" : "bg-surface-3"}`} />
                            ))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <p className="mt-4">
                  {c.name} <span className="text-ink-3">· {c.skills.length} skills</span>
                </p>
                {c.description && <p className="mt-1 text-ink-3">{c.description}</p>}
                <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={`${c.name} skills`}>
                  {c.skills.map((s) => (
                    <li key={s.id} className="chip" title={LEVEL[s.level].label}>
                      {s.name}
                    </li>
                  ))}
                </ul>
              </FadeUp>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
