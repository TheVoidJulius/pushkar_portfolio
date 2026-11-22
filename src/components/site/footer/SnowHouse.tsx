"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { SCENE_LINES } from "@/lib/assistant/scenes";
import { scrollToSection, scrollToY } from "@/lib/scroll";
import { useAssistant, type StageDirection } from "../../momo/AssistantProvider";
import { useTheme } from "../ThemeToggle";
import { playKnock } from "./knock";
import type { SceneSpots, SnowScene } from "./SnowScene";

/**
 * The footer: a snowy night and a little neon cyber-house. When you reach it,
 * Mikuro pads through the snow, goes inside and falls asleep. Knock on the
 * door and she bursts out, furious, and hauls you back to the top.
 */

type Phase = "outside" | "entering" | "asleep" | "knocking" | "angry" | "carrying";

const ANCHORS = ["path", "door", "inside", "out"] as const;

export function SnowHouse({ name, footerNote }: { name: string; footerNote: string }) {
  const a = useAssistant();
  const theme = useTheme();
  const sectionRef = useRef<HTMLElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SnowScene | null>(null);
  const anchorRefs = useRef<Partial<Record<(typeof ANCHORS)[number], HTMLDivElement | null>>>({});
  const doorRef = useRef<HTMLButtonElement>(null);
  const [phase, setPhaseState] = useState<Phase>("outside");
  const phaseRef = useRef<Phase>("outside");
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [knocks, setKnocks] = useState(0);
  const [shout, setShout] = useState<string | null>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const visits = useRef(0);
  const inView = useRef(false);
  const live = useRef(a);
  useEffect(() => {
    live.current = a;
  });

  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };
  const later = (ms: number, fn: () => void) => {
    const t = setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  };
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current.clear();
  };
  const direct = (s: StageDirection | null) => live.current.setStage(s);
  const say = (id: string, line: (typeof SCENE_LINES)[keyof typeof SCENE_LINES]) => live.current.showQuip({ id, ...line }, true);

  /** Scrolled away before knocking: she wakes and comes back out. */
  const leave = () => {
    const p = phaseRef.current;
    if (p !== "entering" && p !== "asleep") return;
    clearTimers();
    direct(null);
    sceneRef.current?.setDoor(false);
    sceneRef.current?.setSleeping(false);
    setPhase("outside");
  };

  // ------------------------------------------------------------------
  // The 3D scene: created when the footer gets close, paused off screen
  // ------------------------------------------------------------------
  useEffect(() => {
    const section = sectionRef.current;
    const host = hostRef.current;
    if (!section || !host) return;
    let scene: SnowScene | null = null;
    let cancelled = false;
    let ro: ResizeObserver | null = null;

    const place = (spots: SceneSpots) => {
      for (const id of ANCHORS) {
        const el = anchorRefs.current[id];
        const p = spots[id];
        if (!el) continue;
        el.style.transform = `translate3d(${(p.x - p.s / 2).toFixed(1)}px, ${(p.y - p.s / 2).toFixed(1)}px, 0)`;
        el.style.width = el.style.height = `${p.s.toFixed(1)}px`;
      }
      const d = doorRef.current;
      if (d) {
        const r = spots.doorRect;
        d.style.transform = `translate3d(${r.x.toFixed(1)}px, ${r.y.toFixed(1)}px, 0)`;
        d.style.width = `${r.w.toFixed(1)}px`;
        d.style.height = `${r.h.toFixed(1)}px`;
      }
    };

    const create = () => {
      if (scene || cancelled) return;
      void import("./SnowScene")
        .then(({ SnowScene }) => {
          if (cancelled) return;
          try {
            scene = new SnowScene({
              dark: document.documentElement.dataset.theme === "dark",
              reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
              mobile: matchMedia("(pointer: coarse)").matches || innerWidth < 640,
            });
          } catch {
            setFailed(true);
            return;
          }
          Object.assign(scene.canvas.style, { width: "100%", height: "100%", display: "block" });
          host.appendChild(scene.canvas);
          scene.onFrame = place;
          sceneRef.current = scene;
          const size = () => scene?.setSize(host.clientWidth, host.clientHeight);
          size();
          ro = new ResizeObserver(size);
          ro.observe(host);
          if (inView.current) scene.start();
          setReady(true);
        })
        .catch(() => setFailed(true));
    };

    // Build ahead of time, so the scene is ready by the time you get there
    const near = new IntersectionObserver(([e]) => e?.isIntersecting && create(), { rootMargin: "900px 0px" });
    near.observe(section);
    const seen = new IntersectionObserver(
      ([e]) => {
        const visible = Boolean(e?.isIntersecting);
        inView.current = visible && (e?.intersectionRatio ?? 0) >= 0.35;
        if (visible) sceneRef.current?.start();
        else sceneRef.current?.stop();
        if (!visible) leave();
      },
      { threshold: [0, 0.35, 0.6] },
    );
    seen.observe(section);
    const onVis = () => (document.hidden ? sceneRef.current?.stop() : inView.current && sceneRef.current?.start());
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      near.disconnect();
      seen.disconnect();
      ro?.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      scene?.canvas.remove();
      scene?.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- set up once; reads live state through refs
  }, []);

  useEffect(() => {
    if (theme) sceneRef.current?.setTheme(theme === "dark");
  }, [theme]);

  // Unmounting mid-story: give Mikuro back to the rest of the site
  useEffect(
    () => () => {
      clearTimers();
      live.current.setStage(null);
    },
    [],
  );

  // ------------------------------------------------------------------
  // The story
  // ------------------------------------------------------------------
  const goInside = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    visits.current++;
    setKnocks(0);
    // Mikuro switched off: the house is simply asleep already
    if (!live.current.assistantVisible) {
      scene.setSleeping(true);
      setPhase("asleep");
      return;
    }
    setPhase("entering");
    scene.walkPaws();
    direct({ anchor: "house-path", face: "happy" });
    say("house-1", visits.current === 1 ? SCENE_LINES.houseCold : SCENE_LINES.houseAgain);
    later(1900, () => {
      scene.setDoor(true);
      direct({ anchor: "house-door", face: "yawning" });
      say("house-2", SCENE_LINES.houseNight);
    });
    later(4300, () => {
      direct({ anchor: "house-inside", face: "sleeping" });
      live.current.showQuip(null);
    });
    later(5200, () => {
      scene.setDoor(false);
      scene.setSleeping(true);
      setPhase("asleep");
    });
  }, []);

  // Wait until Mikuro is free (not chatting or mid-narration), then head in
  useEffect(() => {
    if (!ready || phase !== "outside") return;
    const id = setInterval(() => {
      const s = live.current;
      if (!inView.current || document.hidden) return;
      const free = !s.assistantVisible || (s.cinemaDone && !s.intro && !s.open && !s.narrating && !s.touring && !s.pending && !s.listening && !s.talking);
      if (free) goInside();
    }, 500);
    return () => clearInterval(id);
  }, [ready, phase, goInside]);

  const knock = () => {
    const scene = sceneRef.current;
    if (phaseRef.current !== "asleep" || !scene) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const withMikuro = live.current.assistantVisible;
    setPhase("knocking");
    setKnocks((k) => k + 1);
    if (!live.current.muted) playKnock(2);
    scene.knock();
    later(170, () => scene.knock());

    later(850, () => {
      scene.burst();
      scene.setSleeping(false);
      setPhase("angry");
      if (withMikuro) {
        direct({ anchor: "house-out", face: "angry" });
        say("house-3", SCENE_LINES.houseWho);
      } else {
        scene.setEyes(true);
        setShout(SCENE_LINES.houseWho.text);
      }
    });
    later(2500, () => {
      if (withMikuro) say("house-4", SCENE_LINES.houseTop);
      else setShout("Back to the top with you!");
    });
    later(4000, () => {
      setPhase("carrying");
      setShout(null);
      scene.setEyes(false);
      if (withMikuro) direct({ anchor: "house-carry", face: "angry" });
      if (reduce) scrollToSection("hero");
      else scrollToY(0, false, 2.4);
    });
    later(5200, () => scene.setDoor(false));
    if (!withMikuro) {
      later(6600, () => setPhase("outside"));
      return;
    }
    later(6700, () => {
      direct({ anchor: "house-carry", face: "smug" });
      say("house-5", SCENE_LINES.houseStay);
    });
    later(9400, () => {
      live.current.showQuip(null);
      direct(null);
      setPhase("outside");
    });
  };

  const sleepingNow = phase === "asleep";
  const mikuro = a.settings.name || "Mikuro";
  const dark = theme === "dark";
  const year = new Date().getFullYear();

  return (
    <section
      ref={sectionRef}
      aria-label={`A snowy night outside ${mikuro}'s house`}
      className="relative isolate overflow-hidden"
    >
      <div
        className="relative h-[68vh] min-h-[460px] w-full sm:h-[min(88vh,820px)] sm:min-h-[520px]"
        style={{
        background: dark
          ? "linear-gradient(180deg, var(--bg) 0%, #0a0e20 24%, #11173a 58%, #151b38 100%)"
          : "linear-gradient(180deg, var(--bg) 0%, #f4eff8 26%, #ece5f2 60%, #e7e0ee 100%)",
        }}
      >
        <div ref={hostRef} className="absolute inset-0" aria-hidden />
        {failed && <FallbackHouse />}

        {/* Where Mikuro flies to: positioned every frame from the 3D scene */}
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          {ANCHORS.map((id) => (
            <div
              key={id}
              ref={(el) => {
                anchorRefs.current[id] = el;
              }}
              data-momo-anchor={`house-${id}`}
              data-momo-opacity={id === "inside" ? "0" : undefined}
              className={`absolute top-0 left-0 ${failed ? FALLBACK_SPOTS[id] : ""}`}
            />
          ))}
        </div>

        {/* The door is a real button: click, tap or press Enter to knock */}
        <button
          ref={doorRef}
          type="button"
          onClick={knock}
          disabled={!sleepingNow}
          aria-label={sleepingNow ? `Knock on ${mikuro}'s door (she will take you back to the top)` : `${mikuro}'s front door`}
          className={`absolute top-0 left-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent ${
            sleepingNow ? "cursor-pointer" : "cursor-default"
          } ${failed ? "!top-[52%] !left-[46%] !h-[22%] !w-[8%] !transform-none" : ""}`}
        >
          <AnimatePresence>
            {sleepingNow && (
              <motion.span
                key="hint"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ delay: 0.9, duration: 0.4 }}
                className="pointer-events-none absolute bottom-full left-1/2 mb-[42%] -translate-x-1/2 whitespace-nowrap"
              >
                <span className="snow-hint block rounded-full px-3 py-1 font-mono text-[12px]">knock knock?</span>
              </motion.span>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {phase === "knocking" && (
              <motion.span
                key={`knock-${knocks}`}
                initial={{ opacity: 0, scale: 0.6, rotate: -8 }}
                animate={{ opacity: 1, scale: 1, rotate: -4 }}
                exit={{ opacity: 0, scale: 1.2 }}
                transition={{ type: "spring", stiffness: 600, damping: 18 }}
                className="snow-knock pointer-events-none absolute top-[18%] left-full ml-2 whitespace-nowrap font-mono text-[15px] font-bold"
              >
                knock knock!
              </motion.span>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {shout && (
              <motion.span
                key={shout}
                initial={{ opacity: 0, y: 8, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                className="mikuro-bubble pointer-events-none absolute bottom-full left-1/2 mb-3 -translate-x-1/2 whitespace-nowrap"
              >
                {shout}
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>

      {/* Carried back to the top: Mikuro holds this spot while the page scrolls */}
      <div
        data-momo-anchor="house-carry"
        aria-hidden
        className="pointer-events-none fixed top-[84px] left-1/2 size-[150px] -translate-x-1/2"
      />

      <p className="sr-only" aria-live="polite">
        {phase === "asleep" ? `${mikuro} is asleep inside her igloo. Knock on the ice door to wake her.` : ""}
        {phase === "angry" ? `${mikuro} is not happy about being woken up.` : ""}
      </p>

      <div className="container-page flex flex-col gap-3 pb-10 text-[13.5px] text-ink-3 sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {year} {name}
          {footerNote ? ` · ${footerNote}` : ""}
        </p>
        <button type="button" onClick={() => scrollToSection("hero")} className="font-mono text-[12.5px] transition hover:text-ink">
          <span className="opacity-50">$</span> back to top ↑
        </button>
      </div>
    </section>
  );
}

/** Rough spots for Mikuro over the flat illustration, when WebGL is unavailable. */
const FALLBACK_SPOTS: Record<(typeof ANCHORS)[number], string> = {
  path: "!top-[54%] !left-[30%] !size-[110px] !transform-none",
  door: "!top-[54%] !left-[52%] !size-[100px] !transform-none",
  inside: "!top-[60%] !left-[57%] !size-[40px] !transform-none",
  out: "!top-[50%] !left-[54%] !size-[150px] !transform-none",
};

/** A flat stand-in for the 3D scene (no WebGL): an igloo on a snow field. */
function FallbackIgloo({ dark }: { dark: boolean }) {
  const snow = dark ? "#aab6d4" : "#eef1f5";
  const ice = dark ? "#b9c5e3" : "#f4f7fb";
  const line = dark ? "#7d8bb3" : "#c3cad6";
  return (
    <svg viewBox="0 0 1000 600" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 h-full w-full" aria-hidden>
      <path d="M0 330 L140 250 L260 300 L420 210 L560 290 L700 230 L860 300 L1000 260 L1000 600 L0 600Z" fill={dark ? "#2a3352" : "#d3d8df"} />
      <rect x="0" y="420" width="1000" height="180" fill={snow} />
      <ellipse cx="500" cy="425" rx="640" ry="44" fill={snow} />
      <path d="M330 430 A170 180 0 0 1 670 430Z" fill={ice} stroke={line} strokeWidth="3" />
      {[400, 370, 340, 310, 280].map((y, i) => (
        <line key={y} x1={330 + i * 14} y1={y} x2={670 - i * 14} y2={y} stroke={line} strokeWidth="2" />
      ))}
    </svg>
  );
}
      <path d="M540 430 L540 360 A60 60 0 0 1 660 360 L660 430Z" fill={ice} stroke={line} strokeWidth="3" />
      <path d="M560 430 L560 368 A40 40 0 0 1 640 368 L640 430Z" fill="#ff9a4f" />
