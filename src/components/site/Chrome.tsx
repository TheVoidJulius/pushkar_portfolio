"use client";

import { AnimatePresence, motion } from "motion/react";
import { Home, Moon, Play, RotateCcw, Sun, Volume2, VolumeX, X } from "lucide-react";
import { useEffect, useState } from "react";
import { SECTION_LABELS, SECTIONS } from "@/lib/assistant/protocol";
import { lockScroll, scrollToSection } from "@/lib/scroll";
import { MusicButton } from "../music/MusicPlayer";
import { NowOrb } from "./NowOrb";
import { useAssistant } from "../momo/AssistantProvider";
import { replayIntro } from "./introControl";
import { toggleTheme, useTheme } from "./ThemeToggle";

const ease = [0.23, 1, 0.32, 1] as const;

/** Floating pill controls, top-centre: home · sound · theme · menu */
export function TopNav({ showAssistant }: { showAssistant: boolean }) {
  const a = useAssistant();
  const theme = useTheme();
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    lockScroll(menu);
  }, [menu]);

  return (
    <>
      <a href="#work" className="sr-only z-[90] rounded-full bg-ink px-4 py-2 text-bg focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to content
      </a>
      <nav aria-label="Main" className="fixed top-3 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2">
        <button type="button" onClick={() => scrollToSection("hero")} className="float-btn" aria-label="Back to top">
          <Home className="size-[15px]" strokeWidth={2.2} />
        </button>
        {showAssistant && a.settings.voice_enabled && a.voiceAvailable && (
          <button
            type="button"
            onClick={() => (a.needsSound ? a.enableSound() : a.toggleMute())}
            className="float-btn"
            aria-label={a.needsSound ? "Turn sound on" : "Turn sound off"}
            aria-pressed={!a.needsSound}
          >
            {a.needsSound ? <VolumeX className="size-[15px]" strokeWidth={2.2} /> : <Volume2 className="size-[15px]" strokeWidth={2.2} />}
          </button>
        )}
        <button
          type="button"
          onClick={(e) => toggleTheme({ x: e.clientX, y: e.clientY })}
          className="float-btn"
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        >
          {/* The icon spins round as it swaps */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={theme ?? "light"}
              initial={{ rotate: -120, scale: 0.4, opacity: 0 }}
              animate={{ rotate: 0, scale: 1, opacity: 1 }}
              exit={{ rotate: 120, scale: 0.4, opacity: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 22 }}
              className="grid place-items-center"
            >
              {theme === "dark" ? <Sun className="size-[15px]" strokeWidth={2.2} /> : <Moon className="size-[15px]" strokeWidth={2.2} />}
            </motion.span>
          </AnimatePresence>
        </button>
        <MusicButton />
        <a href="/resume" className="float-btn px-3 text-[12px] font-medium whitespace-nowrap" aria-label="Recruiter mode: open the plain résumé">
          Recruiter mode
        </a>
        <button type="button" onClick={() => setMenu(true)} className="float-btn w-[54px]" aria-label="Open menu" aria-expanded={menu}>
          <span className="flex flex-col gap-[5px]" aria-hidden>
            <span className="h-[1.6px] w-[18px] rounded bg-current" />
            <span className="h-[1.6px] w-[18px] rounded bg-current" />
          </span>
        </button>
      </nav>
      <NowOrb />

      <AnimatePresence>
        {menu && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="fixed inset-0 z-[70] bg-bg/90 backdrop-blur-xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={{ duration: 0.25 }}
            onKeyDown={(e) => e.key === "Escape" && setMenu(false)}
          >
            <button
              type="button"
              autoFocus
              onClick={() => setMenu(false)}
              className="float-btn absolute top-3 left-1/2 w-[54px] -translate-x-1/2"
              aria-label="Close menu"
            >
              <X className="size-[16px]" />
            </button>
            <ul className="mx-auto mt-28 flex max-w-sm flex-col gap-1 px-6">
              {SECTIONS.map((id, i) => (
                <motion.li key={id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 * i, duration: 0.35, ease }}>
                  <button
                    type="button"
                    onClick={() => {
                      setMenu(false);
                      scrollToSection(id);
                    }}
                    className="group flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition hover:bg-surface"
                  >
                    <span className="grid h-[30px] min-w-[30px] place-items-center rounded-full bg-surface-2 text-[13px] tabular-nums">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[17px]">{SECTION_LABELS[id]}</span>
                  </button>
                </motion.li>
              ))}
              {showAssistant && (
                <motion.li initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.35, ease }} className="mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setMenu(false);
                      a.startTour();
                    }}
                    className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left text-ink-3 transition hover:bg-surface hover:text-ink"
                  >
                    <span className="grid h-[30px] min-w-[30px] place-items-center rounded-full bg-accent-soft text-accent-text">
                      <Play className="size-3.5" />
                    </span>
                    Play the tour with {a.settings.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenu(false);
                      replayIntro();
                    }}
                    className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left text-ink-3 transition hover:bg-surface hover:text-ink"
                  >
                    <span className="grid h-[30px] min-w-[30px] place-items-center rounded-full bg-surface-2">
                      <RotateCcw className="size-3.5" />
                    </span>
                    Replay the intro
                  </button>
                </motion.li>
              )}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/** Bottom-centre chips: "Tap for sound" and "Skip intro" */
export function BottomChips() {
  const a = useAssistant();
  const showSound = a.needsSound;
  const showSkip = a.introPlaying;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center gap-2">
      <AnimatePresence>
        {showSound && (
          <motion.button
            key="sound"
            type="button"
            onClick={a.enableSound}
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.3, ease }}
            className="float-btn pointer-events-auto gap-2 !flex px-4 text-[13.5px]"
          >
            <Volume2 className="size-[14px]" strokeWidth={2.2} /> Tap for sound
          </motion.button>
        )}
        {showSkip && (
          <motion.button
            key="skip"
            type="button"
            onClick={a.skipIntro}
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.3, ease }}
            className="float-btn pointer-events-auto !flex px-4 text-[13.5px] text-ink-3"
          >
            Skip narration
          </motion.button>
        )}
        {a.touring && (
          <motion.button
            key="tour"
            type="button"
            onClick={a.stopTour}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="float-btn pointer-events-auto !flex px-4 text-[13.5px]"
          >
            Stop tour
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Rises a block into view once (subtle, quick). */
export function FadeUp({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={{ duration: 0.7, delay, ease }}
    >
      {children}
    </motion.div>
  );
}

/** "01  Projects" */
export function SectionPill({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <p className="section-pill">
      <span>{String(n).padStart(2, "0")}</span>
      <span>{children}</span>
    </p>
  );
}
