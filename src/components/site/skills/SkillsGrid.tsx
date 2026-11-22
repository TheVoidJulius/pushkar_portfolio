"use client";

import type { SkillCategoryWithSkills, SkillLevel } from "@/lib/types";
import { FadeUp } from "../Chrome";
import { CategoryIcon } from "../icons";

export const LEVEL: Record<SkillLevel, { label: string; bars: number }> = {
  expert: { label: "Expert", bars: 3 },
  proficient: { label: "Proficient", bars: 2 },
  familiar: { label: "Familiar", bars: 1 },
};

export const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Level as three little bars (accent = filled). */
export function LevelBars({ level, className = "" }: { level: SkillLevel; className?: string }) {
  return (
    <span className={`flex gap-0.5 ${className}`} role="img" aria-label={LEVEL[level].label}>
      {[1, 2, 3].map((b) => (
        <span key={b} className={`h-1.5 w-2.5 rounded-sm ${b <= LEVEL[level].bars ? "bg-accent" : "bg-surface-3"}`} />
      ))}
    </span>
  );
}

/**
 * The plain skills grid: used when WebGL is unavailable or the visitor
 * prefers reduced motion.
 */
export function SkillsGrid({ categories }: { categories: SkillCategoryWithSkills[] }) {
  return (
    <ul className="container-page mt-16 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {categories.map((c, i) => (
        <li key={c.id} className="flex flex-col">
          <FadeUp delay={i * 0.06} className="flex h-full flex-col">
            {/* panel with a little "terminal sheet" of the skills */}
            <div className="flex aspect-[4/3] items-center justify-center rounded-[20px] bg-surface p-5" aria-hidden>
              <div className="w-full rounded-[10px] bg-bg-elevated p-3.5 shadow-soft">
                <p className="mb-2 flex items-center gap-1.5 font-mono text-[10.5px] text-ink-3">
                  <CategoryIcon name={c.icon} className="size-3" /> {slug(c.name)}
                </p>
                <ul className="space-y-1">
                  {c.skills.slice(0, 6).map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2 font-mono text-[11px]">
                      <span className="truncate">{s.name}</span>
                      <LevelBars level={s.level} />
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <h3 className="mt-4 font-normal">
              {c.name} <span className="text-ink-3">· {c.skills.length} skills</span>
            </h3>
            {c.description && <p className="mt-1 text-ink-3">{c.description}</p>}
            <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={`${c.name} skills`}>
              {c.skills.map((s) => (
                <li key={s.id} className="chip" title={LEVEL[s.level].label}>
                  {s.name}
                  <span className="sr-only"> ({LEVEL[s.level].label})</span>
                </li>
              ))}
            </ul>
          </FadeUp>
        </li>
      ))}
    </ul>
  );
}
