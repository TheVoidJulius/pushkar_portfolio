"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { useAssistant } from "../../momo/AssistantProvider";
import { SOCIAL_LINES } from "./lines";
import { CAT_CSS, GhostCat } from "./GhostCat";
import { randomCat } from "./names";

const MAX_REMOTE = 24;
const STALE_MS = 15_000;
const SEND_EVERY_MS = 125; // ~8 msgs/s
const HEARTBEAT_MS = 3_000;
const IDLE_MS = 4_000;
const HIDE_KEY = "visitor-cats-hidden";

type Remote = {
  id: string;
  name: string;
  hue: number;
  x: number; // current, viewport px
  y: number; // current, document px
  tx: number;
  ty: number;
  seen: number;
  moved: number;
  ready: boolean;
  el: HTMLDivElement | null;
};

const safeGet = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};

/**
 * Live visitor ghost cats. Positions travel over one Supabase Realtime
 * channel (Presence for who is here, Broadcast for movement). Nothing is stored.
 * Without Supabase only your own cat shows.
 */
export function VisitorCats() {
  const [hidden, setHidden] = useState(false);
  const [count, setCount] = useState(1);
  const assistant = useAssistant();
  const greeted = useRef(false);
  const showQuipRef = useRef(assistant.showQuip);
  useEffect(() => {
    showQuipRef.current = assistant.showQuip;
  });
  // The first time another visitor's cat turns up, Mikuro points it out (once a visit)
  useEffect(() => {
    if (count < 2 || greeted.current) return;
    greeted.current = showQuipRef.current({ id: "cats-friend", ...SOCIAL_LINES.catsFriend });
  }, [count]);
  const [list, setList] = useState<{ id: string; name: string; hue: number }[]>([]);
  const [mine, setMine] = useState<{ name: string; hue: number; id: string } | null>(null);
  const remotes = useRef(new Map<string, Remote>());
  const ownEl = useRef<HTMLDivElement | null>(null);
  const hiddenRef = useRef(false);

  useEffect(() => {
    // After hydration: the cat's name, colour and the saved toggle are per-visitor
    const t = window.setTimeout(() => {
      const h = safeGet(HIDE_KEY) === "1";
      hiddenRef.current = h;
      setHidden(h);
      setMine({ ...randomCat(), id: crypto.randomUUID() });
    }, 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    hiddenRef.current = hidden;
  }, [hidden]);

  useEffect(() => {
