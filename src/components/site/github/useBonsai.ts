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
