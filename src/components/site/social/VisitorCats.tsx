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
    if (!mine) return;
    const self = mine;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const R = remotes.current;
    const syncIds = () => setList(Array.from(R.values(), (r) => ({ id: r.id, name: r.name, hue: r.hue })));

    /* own cat state */
    const own = { x: window.innerWidth * 0.78, y: window.innerHeight * 0.72, tx: 0, ty: 0, face: 1, lastMove: performance.now() };
    own.tx = own.x;
    own.ty = own.y;
    let tapDocY = window.scrollY + own.y;
    const setTarget = (cx: number, cy: number) => {
      const nx = cx + 22;
      const ny = Math.max(30, cy + 26);
      if (Math.hypot(nx - own.tx, ny - own.ty) > 3) own.lastMove = performance.now();
      own.tx = nx;
      own.ty = ny;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      setTarget(e.clientX, e.clientY);
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch" && !coarse) return;
      tapDocY = window.scrollY + e.clientY;
      setTarget(e.clientX, e.clientY);
    };
    const onScroll = () => {
      if (!coarse) return;
      // stay with the last tap, riding the viewport edge as the page moves
      const vy = Math.min(window.innerHeight - 20, Math.max(40, tapDocY - window.scrollY));
      if (Math.abs(vy - own.ty) > 3) own.lastMove = performance.now();
      own.ty = vy;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });

    /* realtime */
    let channel: RealtimeChannel | null = null;
    let teardown = false;
    let lastSent = 0;
    let lastSentX = -1;
    let lastSentY = -1;
    const upsert = (id: string, patch: Partial<Remote>) => {
      let r = R.get(id);
      if (!r) {
        if (R.size >= MAX_REMOTE) return null;
        r = { id, name: "Cat", hue: 200, x: 0, y: 0, tx: 0, ty: 0, seen: 0, moved: 0, ready: false, el: null };
        R.set(id, r);
        syncIds();
      }
      Object.assign(r, patch);
      return r;
    };
    const onPos = (id: string, x: number, y: number) => {
      const r = upsert(id, {});
      if (!r) return;
      const px = Math.min(1, Math.max(0, x)) * window.innerWidth;
      const py = Math.max(0, y);
      if (!r.ready) {
        r.x = px;
        r.y = py;
        r.ready = true;
      }
      if (Math.hypot(px - r.tx, py - r.ty) > 3) r.moved = performance.now();
      r.tx = px;
      r.ty = py;
      r.seen = performance.now();
    };

    if (isSupabaseConfigured) {
      import("@/lib/supabase/client")
        .then(({ getSupabaseBrowserClient }) => {
          if (teardown) return;
          const sb = getSupabaseBrowserClient();
          const ch = sb.channel("visitor-cats", { config: { broadcast: { self: false }, presence: { key: self.id } } });
          ch.on("broadcast", { event: "pos" }, ({ payload }) => {
            const p = payload as { id?: string; x?: number; y?: number };
