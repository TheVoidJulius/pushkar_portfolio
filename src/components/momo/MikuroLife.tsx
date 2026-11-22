"use client";

import { useEffect, useRef } from "react";
import { pickQuip, type MikuroAct, type QuipTrigger } from "@/lib/assistant/mikuro";
import { useAssistant } from "./AssistantProvider";

const FIRST_ACT_MS = 28_000;
const ACT_GAP_MS: [number, number] = [32_000, 70_000];
/** Unprompted remarks stay rare, so they remain a surprise. */
const QUIP_COOLDOWN_MS = 42_000;
const MAX_UNPROMPTED_QUIPS = 9;
const AWAY_MS = 10_000;
const LONG_AWAY_MS = 5 * 60_000;
const DWELL_AT_MS = [150_000, 420_000];

const between = ([a, b]: [number, number]) => a + Math.random() * (b - a);

/**
 * Mikuro's inner life: a quiet scheduler that decides when to have a coffee,
 * yawn, get distracted or make a remark, and reacts to what the visitor does.
 * Renders nothing, and only touches React state when a behaviour starts or ends.
 */
export function MikuroLife() {
  const a = useAssistant();
  const live = useRef(a);
  useEffect(() => {
    live.current = a;
  });

  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (fn: () => void, ms: number) => {
      const t = setTimeout(() => {
        timers.delete(t);
        fn();
      }, ms);
      timers.add(t);
      return t;
    };
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let lastQuip = 0;
    let quipCount = 0;
    let cooldowns: Record<string, number> = {};

    const free = () => {
      const s = live.current;
      return (
        s.cinemaDone &&
        !s.stage &&
        !s.intro &&
        !s.open &&
        !s.pending &&
        !s.listening &&
        !s.talking &&
        !s.narrating &&
        !s.touring &&
        !s.act &&
        !document.hidden
      );
    };

    /** An unprompted remark, subject to the global cooldown and session cap. */
    const remark = (trigger: QuipTrigger) => {
      const now = Date.now();
      if (!free() || now - lastQuip < QUIP_COOLDOWN_MS || quipCount >= MAX_UNPROMPTED_QUIPS) return false;
      const said = live.current.showQuip(pickQuip(trigger));
      if (said) {
        lastQuip = now;
        quipCount++;
      }
      return said;
    };

    /** A direct reaction to the visitor, with its own per-trigger cooldown. */
    const respond = (trigger: QuipTrigger, cooldownMs: number) => {
      const now = Date.now();
      if ((cooldowns[trigger] ?? 0) > now) return;
      const s = live.current;
      if (s.open || s.pending || s.listening || s.talking || s.narrating || s.stage || !s.cinemaDone) return;
      if (s.showQuip(pickQuip(trigger))) {
        cooldowns = { ...cooldowns, [trigger]: now + cooldownMs };
        lastQuip = now;
      }
    };

    const perform = (act: MikuroAct, ms: number, then?: () => void) => {
      live.current.setAct(act);
      later(() => {
        if (live.current.act !== act) return;
        live.current.setAct(null);
        then?.();
      }, ms);
    };

    /** Glances around the room, as if something just moved. */
    const lookAround = () => {
      const glances: [number, number][] = [
        [-0.9, -0.25],
        [0.85, 0.1],
        [-0.3, -0.75],
        [0.1, 0.05],
      ];
      perform("lookaround", 3400);
      glances.forEach(([x, y], i) =>
        later(() => {
          live.current.lookRef.current = { x, y, until: performance.now() + 900 };
        }, i * 820),
      );
    };

    const acts: { weight: number; run: () => void }[] = [
      {
        weight: 3,
        run: () => {
          live.current.showQuip(pickQuip("coffeeStart"), true);
          lastQuip = Date.now();
          perform("coffee", 11_000, () => later(() => remark("coffeeEnd") || live.current.showQuip(pickQuip("coffeeEnd")), 250));
        },
      },
      { weight: 3, run: () => perform("yawning", 2600, () => later(() => remark("yawn"), 500)) },
      { weight: 2, run: () => perform("stretching", 3000) },
      {
        weight: 3,
        run: () => {
          lookAround();
          later(() => remark("distracted"), 3500);
        },
      },
      { weight: 3, run: () => remark("idle") },
    ];

    // Main scheduler
    const schedule = (ms: number) =>
      later(() => {
        if (free() && !reduced && live.current.expression !== "sleeping") {
          const total = acts.reduce((n, x) => n + x.weight, 0);
          let roll = Math.random() * total;
          const chosen = acts.find((x) => (roll -= x.weight) < 0) ?? acts[0];
          chosen.run();
        } else if (free() && reduced) {
          remark("idle"); // reduced motion: words instead of movement
        }
        schedule(between(ACT_GAP_MS));
      }, ms);
    schedule(FIRST_ACT_MS);

    DWELL_AT_MS.forEach((ms) => later(() => remark("dwell"), ms));

    // Hover and click reactions, reported by the flying character
    let hovers = 0;
    let clicks: number[] = [];
    live.current.noticeRef.current = (event) => {
      if (event === "hover") {
        hovers++;
        if (!live.current.act) live.current.react("curious", 1100);
        if (hovers % 3 === 0) respond("hover", 30_000);
      } else {
        const now = Date.now();
        clicks = [...clicks.filter((t) => now - t < 3000), now];
        if (clicks.length >= 5) {
          clicks = [];
          live.current.react("surprised", 1300);
          respond("clickSpam", 15_000);
        }
      }
    };

    // Leaving and coming back
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
        return;
      }
      const away = hiddenAt ? Date.now() - hiddenAt : 0;
      if (away < AWAY_MS) return;
      later(() => {
        live.current.react("surprised", 1300);
        respond(away > LONG_AWAY_MS ? "returnedLong" : "returned", 20_000);
      }, 450);
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Frantic cursor (throttled to one sample per frame's worth of movement)
    let px = -1;
    let py = -1;
    let travel = 0;
    let windowStart = 0;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      if (px >= 0) travel += Math.abs(e.clientX - px) + Math.abs(e.clientY - py);
      px = e.clientX;
      py = e.clientY;
      const now = e.timeStamp;
      if (now - windowStart > 2500) {
        windowStart = now;
        travel = 0;
      } else if (travel > Math.max(innerWidth, 1100) * 7) {
        travel = 0;
        respond("cursorFrenzy", 90_000);
      }
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    // Skimming the page at high speed
    let lastY = scrollY;
    let scrolled = 0;
    let scrollStart = 0;
    const onScroll = () => {
      scrolled += Math.abs(scrollY - lastY);
      lastY = scrollY;
      const now = performance.now();
      if (now - scrollStart > 1200) {
        scrollStart = now;
        scrolled = 0;
      } else if (scrolled > innerHeight * 3.2) {
        scrolled = 0;
        respond("fastScroll", 120_000);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    // Theme switched
    const themeWatch = new MutationObserver(() => {
      if (!live.current.open) live.current.react("surprised", 900); // the lights just changed!
      later(() => respond("theme", 60_000), 650);
    });
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    const noticeRef = live.current.noticeRef;
    return () => {
      timers.forEach(clearTimeout);
      noticeRef.current = null;
      themeWatch.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return null;
}
