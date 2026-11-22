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
            if (typeof p?.id === "string" && p.id !== self.id && Number.isFinite(p.x) && Number.isFinite(p.y)) {
              onPos(p.id, p.x as number, p.y as number);
            }
          });
          ch.on("presence", { event: "sync" }, () => {
            const state = ch.presenceState<{ name: string; hue: number }>();
            const keys = Object.keys(state);
            let changedMeta = false;
            setCount(Math.max(1, keys.length));
            for (const k of keys) {
              if (k === self.id) continue;
              const meta = state[k]?.[0];
              if (meta) {
                upsert(k, { name: String(meta.name).slice(0, 14), hue: Number(meta.hue) || 200 });
                changedMeta = true;
              }
            }
            let changed = changedMeta;
            for (const id of Array.from(R.keys())) {
              if (!keys.includes(id)) {
                R.delete(id);
                changed = true;
              }
            }
            if (changed) syncIds();
          });
          ch.subscribe((status) => {
            if (status === "SUBSCRIBED") void ch.track({ name: self.name, hue: self.hue });
          });
          channel = ch;
        })
        .catch(() => {});
    }

    /* dev-only demo: ?cats=demo spawns fake wandering cats */
    let demo: number | undefined;
    if (process.env.NODE_ENV !== "production" && new URLSearchParams(location.search).get("cats") === "demo") {
      const fake: [string, number][] = [
        ["Boba", 330],
        ["Nori", 140],
        ["Yuzu", 48],
        ["Miso", 275],
        ["Pip", 190],
      ];
      fake.forEach(([name, hue], i) => {
        upsert(`demo-${i}`, { name, hue });
        onPos(`demo-${i}`, 0.1 + i * 0.18, window.scrollY + 140 + i * 90);
      });
      syncIds();
      window.setTimeout(() => setCount(fake.length + 1), 0);
      demo = window.setInterval(() => {
        fake.forEach((_, i) => {
          if (Math.random() < 0.55) onPos(`demo-${i}`, 0.06 + Math.random() * 0.88, window.scrollY + 90 + Math.random() * (window.innerHeight - 200));
        });
      }, 1800);
    }

    /* animation loop (writes transforms straight to the DOM, no React renders) */
    let raf = 0;
    let prev = performance.now();
    const place = (el: HTMLDivElement, x: number, y: number, face: number, pose: string) => {
      el.style.transform = `translate3d(${(x - 22).toFixed(1)}px,${(y - 36).toFixed(1)}px,0)`;
      el.style.setProperty("--face", String(face));
      if (el.dataset.pose !== pose) el.dataset.pose = pose;
    };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - prev) / 1000);
      prev = now;
      if (document.hidden) return;
      const k = reduced ? 1 : 1 - Math.exp(-dt * 6.5);

      const dx = own.tx - own.x;
      const dy = own.ty - own.y;
      own.x += dx * k;
      own.y += dy * k;
      if (Math.abs(dx) > 4) own.face = dx > 0 ? 1 : -1;
      const speed = Math.hypot(dx, dy);
      const sitting = !reduced && speed < 6 && now - own.lastMove > IDLE_MS;
      if (ownEl.current) place(ownEl.current, own.x, own.y, own.face, sitting ? "sit" : "walk");

      const sy = window.scrollY;
      const vh = window.innerHeight;
      for (const r of R.values()) {
        if (!r.el) continue;
        const stale = !r.ready || now - r.seen > STALE_MS;
        const rdx = r.tx - r.x;
        r.x += rdx * k;
        r.y += (r.ty - r.y) * k;
        const vy = r.y - sy;
        if (stale || vy < -60 || vy > vh + 60) {
          r.el.style.display = "none";
          continue;
        }
        r.el.style.display = "";
        const moving = Math.hypot(rdx, r.ty - r.y) > 6;
        const face = Math.abs(rdx) > 4 ? (rdx > 0 ? 1 : -1) : Number(r.el.style.getPropertyValue("--face")) || 1;
        place(r.el, r.x, vy, face, !reduced && !moving && now - r.moved > IDLE_MS ? "sit" : "walk");
      }

      /* broadcast own position, throttled */
      if (channel && !hiddenRef.current && now - lastSent > SEND_EVERY_MS) {
        const y = own.y + sy;
        const moved = Math.hypot(own.x - lastSentX, y - lastSentY) > 2;
        if (moved || now - lastSent > HEARTBEAT_MS) {
          lastSent = now;
          lastSentX = own.x;
          lastSentY = y;
          void channel.send({
            type: "broadcast",
            event: "pos",
            payload: { id: self.id, x: +(own.x / window.innerWidth).toFixed(4), y: Math.round(y) },
          });
        }
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      teardown = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", onScroll);
      if (demo) clearInterval(demo);
      if (channel) void channel.unsubscribe();
      R.clear();
    };
  }, [mine]);

  const toggle = () => {
    const next = !hidden;
    setHidden(next);
    try {
      localStorage.setItem(HIDE_KEY, next ? "1" : "0");
    } catch {
      /* private mode: the choice just lasts this visit */
    }
  };

  const label = count <= 1 ? "just you" : `${count} cats here`;
  return (
    <>
      <style>{CAT_CSS}</style>
      <div aria-hidden className="pointer-events-none fixed inset-0 z-30 overflow-hidden" style={{ display: hidden ? "none" : undefined }}>
        {mine && <GhostCat ref={ownEl} hue={mine.hue} />}
        {list.map((c) => (
          <GhostCat
            key={c.id}
            hue={c.hue}
            name={c.name}
            ref={(el) => {
              const cur = remotes.current.get(c.id);
              if (cur) cur.el = el;
            }}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={!hidden}
        aria-label={`Ghost cats ${hidden ? "hidden" : "shown"}, ${label}. Press to ${hidden ? "show" : "hide"} them.`}
        title={mine ? `You are ${mine.name}` : undefined}
        className="float-btn !flex fixed bottom-4 left-4 z-40 h-9 items-center gap-1.5 px-3.5 text-[12.5px] text-ink-2"
      >
        <span aria-hidden>🐾</span>
        <span aria-hidden>{hidden ? "cats hidden" : label}</span>
        <span aria-hidden className="hidden text-ink-3 sm:inline">
          · {hidden ? "show" : "hide"}
        </span>
      </button>
    </>
  );
}
