"use client";

import Image from "next/image";
import type { AboutContent } from "@/lib/types";
import { MomoLine } from "../momo/MomoLine";
import { FadeUp, SectionPill } from "./Chrome";

export function About({ about, name, showAssistant }: { about: AboutContent; name: string; showAssistant: boolean }) {
  return (
    <section id="about" aria-labelledby="about-title" className="container-page py-28 md:py-40">
      <div className="flex flex-col items-center gap-14 text-center">
        {showAssistant && <MomoLine id="about" size={72} className="text-left" />}
        <FadeUp>
          <h2 id="about-title">
            <SectionPill n={4}>About</SectionPill>
          </h2>
        </FadeUp>
      </div>

      <div className="mx-auto mt-16 grid max-w-5xl items-start gap-10 md:grid-cols-[260px_minmax(0,1fr)] md:gap-16">
        <FadeUp>
          <div className="relative aspect-[4/5] overflow-hidden rounded-[20px] bg-surface">
            {about.image_url && (
              <Image src={about.image_url} alt={`Photo of ${name}`} fill sizes="260px" className="object-cover" unoptimized={about.image_url.endsWith(".svg")} />
            )}
          </div>
        </FadeUp>
        <div>
          <FadeUp>
            <p className="text-[17px] leading-[1.5]">{about.introduction}</p>
          </FadeUp>
          {about.biography && (
            <FadeUp delay={0.05}>
              <p className="mt-5 whitespace-pre-line text-ink-3">{about.biography}</p>
            </FadeUp>
          )}
          {about.background && (
            <FadeUp delay={0.1}>
              <p className="mt-5 text-ink-3">
                <span className="text-ink">Background.</span> {about.background}
              </p>
            </FadeUp>
          )}
          {about.interests.length > 0 && (
            <FadeUp delay={0.15}>
              <p className="mt-8 text-ink-3">Off the clock</p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {about.interests.map((i) => (
                  <li key={i} className="chip">
                    {i}
                  </li>
                ))}
              </ul>
            </FadeUp>
          )}
        </div>
      </div>

      {about.highlights.length > 0 && (
        <ul className="mx-auto mt-20 grid max-w-5xl gap-3 md:grid-cols-3">
          {about.highlights.map((h, i) => (
            <li key={h.title}>
              <FadeUp delay={i * 0.06} className="h-full">
                <div className="h-full rounded-[20px] bg-surface p-6">
                  <p className="text-ink">“{h.description}”</p>
                  <p className="mt-4 text-ink-3">{h.title}</p>
                </div>
              </FadeUp>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
