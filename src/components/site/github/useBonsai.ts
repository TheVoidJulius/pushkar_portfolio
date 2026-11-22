"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export type Watering = { id: string; created_at: string; blossom: number };

/** The 8 fixed blossoms a visitor can pick from (no free text, nothing to moderate). */
export const BLOSSOMS = ["🌸", "🌺", "🌼", "🌷", "🌻", "🌹", "🍀", "🍁"] as const;

const LOCAL_KEY = "bonsai-waterings";
const readLocal = (): Watering[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]");
    return Array.isArray(raw)
      ? raw.filter((w) => w && typeof w.id === "string" && Number.isInteger(w.blossom) && w.blossom >= 0 && w.blossom <= 7).slice(0, 60)
      : [];
  } catch {
    return [];
  }
};
const writeLocal = (items: Watering[]) => {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(items.slice(0, 60)));
  } catch {
    /* storage blocked: the blossom still shows for this visit */
  }
};

const merge = (a: Watering[], b: Watering[]) => {
  const seen = new Set<string>();
  return [...a, ...b]
    .filter((w) => (seen.has(w.id) ? false : (seen.add(w.id), true)))
    .sort((x, y) => +new Date(y.created_at) - +new Date(x.created_at))
    .slice(0, 120);
};

export type WaterResult = "shared" | "local" | "rate_limited";

/** Shared waterings (Supabase via /api/bonsai, live over Realtime) with a per-device fallback. */
export function useBonsai(enabled: boolean) {
  const [items, setItems] = useState<Watering[]>([]);
  const [count, setCount] = useState(0);
  const [configured, setConfigured] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const mine = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      const local = readLocal();
      if (!cancelled && local.length) setItems((cur) => merge(cur, local));
    }, 0);
    fetch("/api/bonsai")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { configured: boolean; count: number; items: Watering[] } | null) => {
        if (cancelled || !d) return;
        setConfigured(Boolean(d.configured));
        if (d.configured) {
          setCount(d.count);
          setItems((cur) => merge(d.items, cur.filter((w) => w.id.startsWith("local-"))));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [enabled]);

  // Live blossoms from other visitors
  useEffect(() => {
    if (!enabled || !configured || !isSupabaseConfigured) return;
    let off = () => {};
    let dead = false;
    import("@/lib/supabase/client").then(({ getSupabaseBrowserClient }) => {
      if (dead) return;
      const sb = getSupabaseBrowserClient();
      const ch = sb
        .channel("bonsai-waterings")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "bonsai_waterings" }, (p) => {
          const row = p.new as Watering;
          if (!row?.id || mine.current.has(row.id)) return;
          setItems((cur) => (cur.some((w) => w.id === row.id) ? cur : merge([row], cur)));
          setCount((c) => c + 1);
          setFresh(row.id);
        })
        .subscribe();
      off = () => void sb.removeChannel(ch);
    });
    return () => {
      dead = true;
      off();
    };
  }, [enabled, configured]);

  const water = useCallback(
    async (blossom: number): Promise<WaterResult> => {
      const addLocal = (): WaterResult => {
        const w: Watering = { id: `local-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, created_at: new Date().toISOString(), blossom };
        writeLocal([w, ...readLocal()]);
        setItems((cur) => merge([w], cur));
        setFresh(w.id);
        return "local";
      };
      if (!configured) return addLocal();
      try {
        const r = await fetch("/api/bonsai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blossom }),
        });
        if (r.status === 429) return "rate_limited";
        if (!r.ok) return addLocal();
        const row = (await r.json()) as Watering;
        mine.current.add(row.id);
        setItems((cur) => merge([row], cur));
        setCount((c) => c + 1);
        setFresh(row.id);
        return "shared";
      } catch {
        return addLocal();
      }
    },
    [configured],
  );

  const total = configured ? count : items.length;
  const last = items[0]?.created_at ?? null;
  return { items, total, last, configured, fresh, water };
}
