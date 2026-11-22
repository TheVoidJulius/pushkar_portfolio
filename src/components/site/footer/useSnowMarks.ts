"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/** One mark in the snow: which of the 4 fixed kinds, and where (0..1 across the snowfield). */
export type SnowMark = { id: string; created_at: string; kind: number; x: number; z: number };

/** The 4 fixed marks a visitor can leave (no free text, nothing to moderate). */
export const MARK_KINDS = [
  { name: "paw print", glyph: "🐾" },
  { name: "footprints", glyph: "👣" },
  { name: "tiny snowman", glyph: "⛄" },
  { name: "snow angel", glyph: "👼" },
] as const;

export const MAX_MARKS = 200;

const valid = (m: SnowMark | null | undefined): m is SnowMark =>
  Boolean(m) &&
  typeof m!.id === "string" &&
  Number.isInteger(m!.kind) &&
  m!.kind >= 0 &&
  m!.kind <= 3 &&
  Number.isFinite(m!.x) &&
  Number.isFinite(m!.z) &&
  m!.x >= 0 &&
  m!.x <= 1 &&
  m!.z >= 0 &&
  m!.z <= 1;

const LOCAL_KEY = "snow-marks";
const readLocal = (): SnowMark[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter(valid).slice(0, 40) : [];
  } catch {
    return [];
  }
};
const writeLocal = (items: SnowMark[]) => {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(items.slice(0, 40)));
  } catch {
    /* storage blocked: the mark still shows for this visit */
  }
};

const merge = (a: SnowMark[], b: SnowMark[]) => {
  const seen = new Set<string>();
  return [...a, ...b]
    .filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)))
    .sort((p, q) => +new Date(q.created_at) - +new Date(p.created_at))
    .slice(0, MAX_MARKS);
};

export type MarkResult = "shared" | "local" | "rate_limited";

/** Shared snow marks (Supabase via /api/snow, live over Realtime) with a per-device fallback. */
export function useSnowMarks(enabled: boolean) {
  const [items, setItems] = useState<SnowMark[]>([]);
  const [count, setCount] = useState(0);
  const [configured, setConfigured] = useState(false);
  const [settled, setSettled] = useState(false);
  const mine = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      const local = readLocal();
      if (!cancelled && local.length) setItems((cur) => merge(cur, local));
    }, 0);
    fetch("/api/snow")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { configured: boolean; count: number; items: SnowMark[] } | null) => {
        if (cancelled) return;
        setSettled(true);
        if (!d) return;
        setConfigured(Boolean(d.configured));
        if (d.configured) {
          setCount(d.count);
          setItems((cur) => merge(d.items.filter(valid), cur.filter((m) => m.id.startsWith("local-"))));
        }
      })
      .catch(() => !cancelled && setSettled(true));
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [enabled]);

  // Live marks from other visitors
  useEffect(() => {
    if (!enabled || !configured || !isSupabaseConfigured) return;
    let off = () => {};
    let dead = false;
    import("@/lib/supabase/client").then(({ getSupabaseBrowserClient }) => {
      if (dead) return;
      const sb = getSupabaseBrowserClient();
      const ch = sb
        .channel("snow-marks")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "snow_marks" }, (p) => {
          const row = p.new as SnowMark;
          if (!valid(row) || mine.current.has(row.id)) return;
          setItems((cur) => (cur.some((m) => m.id === row.id) ? cur : merge([row], cur)));
          setCount((c) => c + 1);
        })
        .subscribe();
      off = () => void sb.removeChannel(ch);
    });
    return () => {
      dead = true;
      off();
    };
  }, [enabled, configured]);

  const leave = useCallback(
    async (kind: number, x: number, z: number): Promise<MarkResult> => {
      const addLocal = (): MarkResult => {
        const m: SnowMark = { id: `local-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, created_at: new Date().toISOString(), kind, x, z };
        writeLocal([m, ...readLocal()]);
        setItems((cur) => merge([m], cur));
        return "local";
      };
      if (!configured) return addLocal();
      try {
        const r = await fetch("/api/snow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, x, z }),
        });
        if (r.status === 429) return "rate_limited";
        if (!r.ok) return addLocal();
        const row = (await r.json()) as SnowMark;
        mine.current.add(row.id);
        setItems((cur) => merge([row], cur));
        setCount((c) => c + 1);
        return "shared";
      } catch {
        return addLocal();
      }
    },
    [configured],
  );

  const total = configured ? Math.max(count, items.length) : items.length;
  return { items, total, configured, settled, leave };
}
