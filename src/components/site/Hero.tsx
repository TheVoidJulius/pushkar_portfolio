"use client";

import { motion } from "motion/react";
import Image from "next/image";
import { scrollToSection } from "@/lib/scroll";
import type { Profile } from "@/lib/types";
import { MomoLine } from "../momo/MomoLine";

const ease = [0.23, 1, 0.32, 1] as const;

function BlurWords({ text, delay = 0, className = "", wordClassName = "" }: { text: string; delay?: number; className?: string; wordClassName?: string }) {
  return (
    <span className={className}>
      {text.split(" ").map((w, i) => (
        <motion.span
          key={i}
          className={`inline-block whitespace-pre ${wordClassName}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: delay + i * 0.06, ease }}
        >
          {w}{" "}
        </motion.span>
      ))}
    </span>
  );
}

function go(href: string) {
  if (href.startsWith("#")) scrollToSection(href.slice(1));
  else if (/^https?:/.test(href)) window.open(href, "_blank", "noopener,noreferrer");
  else window.location.assign(href);
}

export function Hero({ profile, showAssistant }: { profile: Profile; showAssistant: boolean }) {
  const first = profile.name.split(" ")[0];
  return (
    <section id="hero" aria-labelledby="hero-title" className="container-page relative flex min-h-[100svh] flex-col pt-20 pb-24">
      <div className="flex items-start justify-between gap-6">
        {/* Owner: avatar + two lines, like the opening of a conversation */}
        <div className="flex items-center gap-3.5">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease }}
            className="relative size-12 shrink-0 overflow-hidden rounded-full bg-surface-2"
          >
            {profile.profile_image_url && (
              <Image
                src={profile.profile_image_url}
                alt={`Portrait of ${profile.name}`}
                fill
                priority
                sizes="48px"
                className="object-cover"
                unoptimized={profile.profile_image_url.endsWith(".svg")}
              />
            )}
          </motion.div>
          <h1 id="hero-title" className="leading-[1.45]">
            <span className="block text-ink">
              <BlurWords text="Hello, I'm" delay={0.15} />
              <BlurWords text={`${first}.`} delay={0.27} wordClassName="chrome-text font-semibold" />
            </span>
            <BlurWords text={profile.designation} delay={0.45} className="block text-ink-3" />
          </h1>
        </div>

        {showAssistant && <MomoLine id="hero" align="right" size={112} className="mt-16 hidden md:flex" />}
      </div>
      {showAssistant && <MomoLine id="hero" align="left" size={84} className="mt-8 md:hidden" />}

      {/* Where Momo first appears, before she settles beside her line */}
      {showAssistant && (
        <div data-momo-anchor="intro" aria-hidden className="pointer-events-none absolute top-[26%] left-[55%] size-[clamp(150px,19vw,250px)] md:left-[58%]" />
      )}

      <div className="mt-auto grid items-end gap-10 pt-24 md:grid-cols-[minmax(0,420px)_1fr_minmax(0,240px)]">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.9, ease }}>
          <p className="text-ink">{profile.introduction}</p>
          <p className="mt-4 text-ink-3">{profile.description}</p>
          <div className="mt-6 flex items-center gap-6">
            <button type="button" onClick={() => go(profile.cta_secondary_href)} className="chrome-btn">
              {profile.cta_secondary_label}
            </button>
            <button type="button" onClick={() => go(profile.cta_primary_href)} className="text-ink-3 transition hover:text-ink">
              {profile.cta_primary_label} →
            </button>
          </div>
        </motion.div>
        <div className="hidden md:block" />
        {profile.stats.length > 0 && (
          <motion.dl
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 1.05, ease }}
            className="grid grid-cols-[1fr_auto] gap-x-8 gap-y-2"
          >
            {profile.stats.map((s) => (
              <div key={s.label} className="contents">
                <dt className="text-ink-3">{s.label}</dt>
                <dd className="text-right tabular-nums">
                  {s.live && (
                    <span
                      role="img"
                      aria-label="Live value"
                      title="Live: refreshed from the source every few hours"
                      className="mr-1.5 inline-block size-1.5 -translate-y-px rounded-full bg-emerald-400/80"
                    />
                  )}
                  {s.value}
                </dd>
              </div>
            ))}
          </motion.dl>
        )}
      </div>
      {profile.location && <p className="sr-only">Based in {profile.location}</p>}
    </section>
  );
}
