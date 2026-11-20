"use client";

import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, Sparkles, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef } from "react";
import { lockScroll } from "@/lib/scroll";
import type { Project } from "@/lib/types";
import { SocialIcon } from "./icons";

export function Cover({ p, sizes, priority }: { p: Project; sizes: string; priority?: boolean }) {
  if (!p.image_url) {
    return (
      <div className="grid h-full w-full place-items-center bg-gradient-to-br from-lavender-soft to-accent-soft font-display text-6xl text-ink-3">
        {p.title[0]}
      </div>
    );
  }
  return (
    <Image
      src={p.image_url}
      alt=""
      fill
      sizes={sizes}
      priority={priority}
      className="object-cover transition-transform duration-[1.2s] ease-[cubic-bezier(.16,1,.3,1)] group-hover:scale-[1.06]"
      unoptimized={p.image_url.endsWith(".svg")}
    />
  );
}

export function ProjectDialog({ p, onClose }: { p: Project; onClose: () => void }) {
  const reduce = useReducedMotion();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    lockScroll(true);
    return () => {
      window.removeEventListener("keydown", onKey);
      lockScroll(false);
      prev?.focus();
    };
  }, [onClose]);

  return (
    <motion.div
      className="fixed inset-0 z-[55] flex items-end justify-center bg-black/45 backdrop-blur-sm sm:items-center sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-dialog-title"
        onClick={(e) => e.stopPropagation()}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 60, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: 40, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
        className="relative max-h-[92dvh] w-full max-w-3xl overflow-y-auto overscroll-contain rounded-t-[32px] border border-line bg-bg-elevated shadow-lift sm:rounded-[32px]"
        data-lenis-prevent
      >
        <div className="relative aspect-[16/8] bg-surface-2">
          <Cover p={p} sizes="(min-width:768px) 768px, 100vw" />
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close project details"
          className="absolute top-4 right-4 grid size-10 place-items-center rounded-full bg-bg-elevated/90 text-ink shadow-soft backdrop-blur"
        >
          <X className="size-5" />
        </button>
        <div className="p-6 sm:p-9">
          <p className="label-mono">{[p.category, p.year].filter(Boolean).join(" · ")}</p>
          <h3 id="project-dialog-title" className="mt-1 text-[28px] font-semibold tracking-[-0.03em]">
            {p.title}
          </h3>
          {p.highlight && (
            <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 text-[13.5px] font-medium text-accent-text">
              <Sparkles className="size-3.5" /> {p.highlight}
            </p>
          )}
          <p className="mt-5 text-[17px] leading-relaxed text-ink">{p.summary}</p>
          {p.description && <p className="mt-4 text-[15.5px] leading-relaxed whitespace-pre-line text-ink-2">{p.description}</p>}
          {p.technologies.length > 0 && (
            <>
              <p className="label-mono mt-8 mb-3">Built with</p>
              <ul className="flex flex-wrap gap-2">
                {p.technologies.map((t) => (
                  <li key={t} className="rounded-full border border-line px-3 py-1.5 font-mono text-[12.5px] text-ink-2">
                    {t}
                  </li>
                ))}
              </ul>
            </>
          )}
          {(p.demo_url || p.github_url) && (
            <div className="mt-9 flex flex-wrap gap-3">
              {p.demo_url && (
                <a
                  href={p.demo_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-medium text-bg transition hover:opacity-90"
                >
                  Live demo <ArrowUpRight className="size-4" />
                </a>
              )}
              {p.github_url && (
                <a
                  href={p.github_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-12 items-center gap-2 rounded-full border border-line-strong px-6 text-[15px] font-medium text-ink transition hover:bg-surface-2"
                >
                  <SocialIcon platform="github" className="size-[18px]" /> View code
                </a>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
