"use client";

import { MotionConfig } from "motion/react";
import type { PortfolioContent } from "@/lib/types";
import { AssistantDock } from "../momo/AssistantDock";
import { AssistantProvider } from "../momo/AssistantProvider";
import { MikuroLife } from "../momo/MikuroLife";
import { MomoFlight } from "../momo/MomoFlight";
import { MusicPlayer } from "../music/MusicPlayer";
import { About } from "./About";
import { BottomChips, TopNav } from "./Chrome";
import { CinematicIntro } from "./CinematicIntro";
import { Contact } from "./Contact";
import { ExperienceDial } from "./ExperienceDial";
import { FestiveQuip } from "./FestiveQuip";
import { GitHubActivity } from "./GitHubActivity";
import { Hero } from "./Hero";
import { Skills } from "./Skills";
import { VisitorCats } from "./social/VisitorCats";
import { SmoothScroll } from "./SmoothScroll";
import { Work } from "./Work";

export function PublicSite({ content, previewBanner }: { content: PortfolioContent; previewBanner?: React.ReactNode }) {
  const show = content.site.show_assistant;
  return (
    <AssistantProvider content={content}>
      {/* Reduced motion is handled here, so server and client render identically */}
      <MotionConfig reducedMotion="user">
      <CinematicIntro />
      <SmoothScroll />
      {previewBanner}
      <TopNav showAssistant={show} />
      <main>
        <Hero profile={content.profile} showAssistant={show} />
        <Work projects={content.projects} showAssistant={show} />
        <Skills categories={content.skillCategories} showAssistant={show} />
        <ExperienceDial items={content.experiences} showAssistant={show} />
        <GitHubActivity showAssistant={show} />
        <About about={content.about} name={content.profile.name} showAssistant={show} />
      </main>
      <Contact contact={content.contact} name={content.profile.name} footerNote={content.site.footer_note} showAssistant={show} />
      <MusicPlayer />
      <VisitorCats />
      {show && <FestiveQuip />}
      {show && (
        <>
          <BottomChips />
          <AssistantDock />
          <MomoFlight />
          <MikuroLife />
        </>
      )}
      </MotionConfig>
    </AssistantProvider>
  );
}
