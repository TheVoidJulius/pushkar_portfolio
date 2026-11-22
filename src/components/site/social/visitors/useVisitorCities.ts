"use client";

import { useEffect, useState } from "react";

export type VisitorCity = { city: string; country: string; lat: number; lon: number; visits: number };
type Geo = Omit<VisitorCity, "visits">;

const DAY_KEY = "visitor-city-day";
const utcDay = () => new Date().toISOString().slice(0, 10);

/** Dev only: forward ?geo=<city> / ?geo=demo from the page URL to the API. */
const devQuery = () => {
  if (process.env.NODE_ENV === "production") return "";
  const g = new URLSearchParams(location.search).get("geo");
  return g ? `?geo=${encodeURIComponent(g)}` : "";
};

const isGeo = (v: unknown): v is Geo => {
  const g = v as Geo | null;
  return !!g && typeof g.city === "string" && typeof g.country === "string" && Number.isFinite(g.lat) && Number.isFinite(g.lon);
};

const readDay = (): { day: string; you: Geo | null } | null => {
  try {
    const v = JSON.parse(localStorage.getItem(DAY_KEY) ?? "null");
    return v && typeof v.day === "string" ? { day: v.day, you: isGeo(v.you) ? v.you : null } : null;
  } catch {
    return null;
  }
};

let recording: Promise<Geo | null> | null = null;

/** Counts this visitor's city at most once per (UTC) day per device. */
export function recordVisitOnce(): Promise<Geo | null> {
  if (recording) return recording;
  recording = (async () => {
    const day = utcDay();
    const saved = readDay();
    if (saved?.day === day && !devQuery()) return saved.you;
    try {
      const r = await fetch(`/api/visitors${devQuery()}`, { method: "POST" });
      if (!r.ok && r.status !== 429) return saved?.you ?? null;
      const d = r.ok ? ((await r.json()) as { you?: unknown }) : null;
      const you = isGeo(d?.you) ? d.you : (saved?.you ?? null);
      try {
        localStorage.setItem(DAY_KEY, JSON.stringify({ day, you }));
      } catch {
        /* storage blocked: we may count this device again on a later visit */
      }
      return you;
    } catch {
      return saved?.you ?? null;
    }
  })();
  return recording;
}

/**
 * Today's visitor cities. Records the visit shortly after load (for everyone),
 * but only fetches the list once `active` (the globe scrolled near view).
 */
export function useVisitorCities(active: boolean) {
  const [cities, setCities] = useState<VisitorCity[] | null>(null);
  const [you, setYou] = useState<Geo | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => void recordVisitOnce(), 2500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      const mine = await recordVisitOnce();
      let list: VisitorCity[] = [];
      try {
        const r = await fetch(`/api/visitors${devQuery()}`);
        const d = r.ok ? ((await r.json()) as { cities?: unknown }) : null;
        if (Array.isArray(d?.cities)) list = d.cities.filter(isGeo) as VisitorCity[];
      } catch {
        /* offline: just show the visitor's own city */
      }
      // Without Supabase (or before the cache catches up) the visitor still sees their own city
      if (mine && !list.some((c) => c.city === mine.city && c.country === mine.country)) list = [...list, { ...mine, visits: 1 }];
      if (cancelled) return;
      setYou(mine);
      setCities(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [active]);

  return { cities, you };
}
