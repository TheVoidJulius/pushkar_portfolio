"use client";

import { useEffect, useRef, useState } from "react";
import { useAssistant } from "../../../momo/AssistantProvider";
import { SOCIAL_LINES } from "../lines";
import { landDots } from "./landDots";
import { useVisitorCities, type VisitorCity } from "./useVisitorCities";

const SIZE = 112; // css px
const TILT = (20 * Math.PI) / 180; // look slightly down on the north
const SPIN = 7; // degrees per second
const FRAME_MS = 1000 / 30;
const RAD = Math.PI / 180;

const cssVar = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

/**
 * "Cats from N cities today": a small Canvas2D dotted globe in the footer,
 * with a glowing dot per city that visited today. It only fetches and draws
 * once scrolled near view, stops when offscreen or the tab is hidden, and
 * holds still for reduced motion. The city list is always available as text.
 */
export function VisitorMap() {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [active, setActive] = useState(false);
  const { cities, you } = useVisitorCities(active);
  const citiesRef = useRef<VisitorCity[]>([]);
  const assistant = useAssistant();
  const quipped = useRef(false);

  useEffect(() => {
    citiesRef.current = cities ?? [];
  }, [cities]);

  // Wake up when the footer comes near (one-shot)
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setActive(true);
          io.disconnect();
        }
      },
      { rootMargin: "300px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Mikuro notices the map once a visit, when there's a crowd worth mentioning
  useEffect(() => {
    if (quipped.current || !cities || cities.length < 3) return;
    quipped.current = assistant.showQuip({ id: "cats-cities", ...SOCIAL_LINES.catsCities });
  }, [cities, assistant]);

  // Draw loop: 30fps, only while visible
  useEffect(() => {
    const cv = canvas.current;
    if (!active || !cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(SIZE * dpr);
    cv.height = Math.round(SIZE * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const dots = landDots();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const R = SIZE / 2 - 3;
    const c = SIZE / 2;
    const sinT = Math.sin(TILT);
    const cosT = Math.cos(TILT);
    let lon0 = you ? you.lon : 78; // start over the visitor (or India)
    let colors = { land: "#8a8a85", glow: "#e0527a", rim: "#8a8a85" };
    const readColors = () => {
      colors = { land: cssVar("--ink-3", "#8a8a85"), glow: cssVar("--accent", "#e0527a"), rim: cssVar("--ink-3", "#8a8a85") };
    };
    readColors();

    // returns depth z (>0 visible) and writes screen coords into out
    const out = { x: 0, y: 0 };
    const project = (lon: number, lat: number) => {
      const l = (lon - lon0) * RAD;
      const p = lat * RAD;
      const cp = Math.cos(p);
      const x = cp * Math.sin(l);
      const y = cosT * Math.sin(p) - sinT * cp * Math.cos(l);
      const z = sinT * Math.sin(p) + cosT * cp * Math.cos(l);
      out.x = c + x * R;
      out.y = c - y * R;
      return z;
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = colors.rim;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(c, c, R + 1.5, 0, Math.PI * 2);
      ctx.stroke();

      // land dots in two depth bands: one path + fill each
      ctx.fillStyle = colors.land;
      for (const [lo, hi, a] of [
        [0, 0.35, 0.28],
        [0.35, 1.01, 0.62],
      ] as const) {
        ctx.globalAlpha = a;
        ctx.beginPath();
        for (let i = 0; i < dots.length; i += 2) {
          const z = project(dots[i], dots[i + 1]);
          if (z <= lo || z > hi) continue;
          ctx.rect(out.x - 0.75, out.y - 0.75, 1.5, 1.5);
        }
        ctx.fill();
      }

      // today's cities
      const list = citiesRef.current;
      const pulse = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t / 420);
      ctx.fillStyle = colors.glow;
      for (const city of list) {
        const z = project(city.lon, city.lat);
        if (z <= 0.02) continue;
        const r = 1.4 + Math.min(1.6, Math.log2(1 + city.visits) * 0.5);
        ctx.globalAlpha = (0.18 + 0.22 * pulse) * z;
        ctx.beginPath();
        ctx.arc(out.x, out.y, r * (2.2 + pulse), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = Math.min(1, 0.45 + z);
        ctx.beginPath();
        ctx.arc(out.x, out.y, r * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    let visible = true;
    let raf = 0;
    let last = 0;
    let lastColor = 0;
    const loop = (now: number) => {
      raf = 0;
      if (!visible || document.hidden) return;
      raf = requestAnimationFrame(loop);
      if (now - last < FRAME_MS) return;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      lon0 = (lon0 + SPIN * dt + 540) % 360 - 180;
      if (now - lastColor > 1000) {
        lastColor = now;
        readColors(); // follows the theme toggle
      }
      draw(now);
    };
    const start = () => {
      if (reduced) {
        readColors();
        draw(0);
      } else if (!raf && visible && !document.hidden) {
        last = 0;
        raf = requestAnimationFrame(loop);
      }
    };

    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      if (visible) start();
    });
    io.observe(cv);
    const onVis = () => {
      if (!document.hidden) start();
    };
    document.addEventListener("visibilitychange", onVis);
    // reduced motion: no loop, just an occasional repaint for new data or theme
    const still = reduced
      ? window.setInterval(() => {
          if (visible && !document.hidden) start();
        }, 1500)
      : 0;
    start();
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      cancelAnimationFrame(raf);
      clearInterval(still);
    };
  }, [active, you]);

  const n = cities?.length ?? 0;
  const label = cities === null ? "counting cats…" : `cats from ${n} ${n === 1 ? "city" : "cities"} today`;
  const names = (cities ?? []).map((c) => c.city);
  const shown = names.slice(0, 3).join(", ") + (names.length > 3 ? ` +${names.length - 3} more` : "");

  return (
    <div ref={wrap} className="mt-8 flex items-center gap-4">
      <canvas ref={canvas} aria-hidden style={{ width: SIZE, height: SIZE }} className="shrink-0" />
      <div className="min-w-0 text-[13.5px]">
        <p className="text-ink-2">
          <span aria-hidden>🐾 </span>
          {label}
        </p>
        {shown && (
          <p aria-hidden className="mt-1 truncate text-ink-3" title={names.join(", ")}>
            {shown}
          </p>
        )}
        {cities && cities.length > 0 && (
          <ul className="sr-only" aria-label="Cities visitors came from today">
            {cities.map((c) => (
              <li key={`${c.city}-${c.country}`}>
                {c.city}, {c.country}
                {you && you.city === c.city && you.country === c.country ? " (you)" : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
