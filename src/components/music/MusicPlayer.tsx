"use client";

import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useAnimationFrame,
  useDragControls,
  useMotionValue,
  useReducedMotion,
} from "motion/react";
import { ArrowUpRight, ChevronLeft, ChevronsLeft, FastForward, Loader2, Pause, Play, RefreshCw, Rewind } from "lucide-react";
import Image from "next/image";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { TRACKS, youtubeUrl, type Track } from "@/lib/music/tracks";
import { getMusic, music, useMusic } from "./controller";
import { trackSpecular, useLiquidGlass } from "./LiquidGlass";

const spring = { type: "spring", stiffness: 380, damping: 32 } as const;
const soft = { type: "spring", stiffness: 260, damping: 30 } as const;

const clock = (s: number) => {
  if (!Number.isFinite(s) || s < 0) return "--:--";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

/** Everything music on the page: the glass panel and its tucked-away tab. */
export function MusicPlayer() {
  const view = useMusic((s) => s.view);
  return (
    <>
      <AnimatePresence>{view === "open" && <Panel key="panel" />}</AnimatePresence>
      <AnimatePresence>{view === "docked" && <DockTab key="dock" />}</AnimatePresence>
    </>
  );
}

/** The nav-bar button: opens the player, shows a live equaliser while music plays. */
export function MusicButton() {
  const view = useMusic((s) => s.view);
  const playing = useMusic((s) => s.playing);
  return (
    <button
      type="button"
      onClick={() => (view === "open" ? music.dock() : music.open())}
      className="float-btn"
      aria-label={view === "open" ? "Tuck the music player away" : "Open the music player"}
      aria-expanded={view === "open"}
    >
      <Equaliser playing={playing} />
    </button>
  );
}

function Equaliser({ playing, className = "" }: { playing: boolean; className?: string }) {
  return (
    <span aria-hidden className={`eq ${playing ? "eq-on" : ""} ${className}`}>
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

function Panel() {
  const screen = useMusic((s) => s.screen);
  const ref = useRef<HTMLDivElement>(null);
  const filterId = `lg-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
  const glass = useLiquidGlass(ref, filterId, { radius: 34, edge: 24, strength: 64 });
  const drag = useDragControls();
  const reduce = useReducedMotion();
  const [nudge, setNudge] = useState(false);

  useEffect(() => {
    // Focus the panel so Space / arrows / Esc control the music straight away
    const t = setTimeout(() => ref.current?.focus({ preventScroll: true }), 60);
    return () => clearTimeout(t);
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Only while focus is in the player: Esc elsewhere belongs to the chat, menu or dialogs
    if (e.key === "Escape") {
      e.stopPropagation();
      music.dock();
      return;
    }
    const target = e.target as HTMLElement;
    if (target.closest("button, a, [role=slider]")) return; // let controls handle their own keys
    const s = getMusic(); // latest state, without re-rendering the panel every tick
    if (e.key === " ") {
      e.preventDefault();
      if (s.started || s.screen === "track") music.toggle();
    } else if (e.key === "ArrowRight" && s.started) music.seek(s.time + 5);
    else if (e.key === "ArrowLeft" && s.started) music.seek(s.time - 5);
  };

  // Start a sideways drag from anywhere that isn't a control
  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button, a, [role=slider], [data-no-drag]")) return;
    drag.start(e);
  };

  return (
    <>
      {glass.filter}
      <motion.div
        ref={ref}
        role="dialog"
        aria-modal="false"
        aria-label="Music player"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onPointerMove={trackSpecular}
        onPointerDown={startDrag}
        drag="x"
        dragControls={drag}
        dragListener={false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.85, right: 0.06 }}
        onDrag={(_, info) => setNudge(info.offset.x < -70)}
        onDragEnd={(_, info) => {
          setNudge(false);
          if (info.offset.x < -90 || info.velocity.x < -480) music.dock();
        }}
        initial={reduce ? { opacity: 0 } : { opacity: 0, x: -40, y: 24, scale: 0.94 }}
        animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
        // Slides into the left edge, where the tab takes over
        exit={reduce ? { opacity: 0 } : { opacity: 0, x: -160, scaleX: 0.55, scaleY: 0.82, filter: "blur(6px)", transition: { duration: 0.32, ease: [0.5, 0, 0.75, 0] } }}
        transition={soft}
        style={{ transformOrigin: "left center", ...glass.style }}
        className="liquid-glass fixed right-2 bottom-2 left-2 z-[49] cursor-grab touch-pan-y rounded-[34px] p-4 outline-none select-none active:cursor-grabbing sm:right-auto sm:bottom-5 sm:left-5 sm:w-[452px] sm:p-5"
      >
        {/* Grip on the left edge: drag it (or the panel) toward the side to tuck it away */}
        <span aria-hidden className={`music-grip ${nudge ? "music-grip-on" : ""}`} />
        <LayoutGroup>
          <AnimatePresence mode="popLayout" initial={false}>
            {screen === "list" ? <ListScreen key="list" /> : <TrackScreen key="track" />}
          </AnimatePresence>
        </LayoutGroup>
      </motion.div>
    </>
  );
}

function Header({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      {children}
      <button type="button" onClick={() => music.dock()} className="glass-pill grid size-10 shrink-0 place-items-center" aria-label="Tuck the player away (music keeps playing)" title="Tuck away">
        <ChevronsLeft className="size-[18px]" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Screen 1: "Listening to…" — the stack of covers
// ---------------------------------------------------------------------------

function ListScreen() {
  const [spin, setSpin] = useState(0);
  return (
    <motion.div initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={spring}>
      <Header>
        <h2 className="pl-1 text-[24px] font-semibold tracking-[-0.03em] text-ink sm:text-[27px]">Listening to…</h2>
        <div className="ml-auto">
          <button
            type="button"
            onClick={() => {
              music.shuffle();
              setSpin((s) => s + 1);
            }}
            className="glass-pill inline-flex h-10 items-center gap-2 px-4 text-[15px] text-ink-2"
          >
            <motion.span animate={{ rotate: spin * 360 }} transition={{ type: "spring", stiffness: 140, damping: 18 }} className="grid place-items-center">
              <RefreshCw className="size-4" />
            </motion.span>
            Refresh
          </button>
        </div>
      </Header>
      <CoverStack />
      <NowPlayingStrip />
    </motion.div>
  );
}

function CoverStack() {
  const order = useMusic((s) => s.order);
  const current = useMusic((s) => s.index);
  const started = useMusic((s) => s.started);
  const playing = useMusic((s) => s.playing);
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(400);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const size = width < 360 ? 118 : 156;
  const n = order.length;
  const stepX = n > 1 ? (width - size) / (n - 1) : 0;
  const hovered = hover !== null ? TRACKS[order[hover]] : null;
  const hx = hover !== null ? hover * stepX : 0;

  return (
    <div ref={wrap} className="relative mt-5 [perspective:900px]" style={{ height: size + 42 }} onPointerLeave={() => setHover(null)} data-no-drag>
      {order.map((ti, pos) => {
        const t = TRACKS[ti];
        const lifted = hover === pos;
        // Neighbours lean away from the one you're pointing at
        const shift = hover === null ? 0 : pos < hover ? -10 : pos > hover ? 16 : 0;
        return (
          <motion.button
            key={t.slug}
            type="button"
            onClick={() => music.select(ti)}
            onPointerEnter={() => setHover(pos)}
            onFocus={() => setHover(pos)}
            onBlur={() => setHover(null)}
            aria-label={`Play ${t.title} by ${t.artist}`}
            className="cover-reflect absolute top-6 left-0 overflow-hidden rounded-[10px] bg-surface-2 shadow-[0_14px_30px_-14px_rgba(0,0,0,0.55),0_0_0_1px_rgba(0,0,0,0.25)] outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
            style={{ width: size, height: size, zIndex: lifted ? 40 : n - pos }}
            initial={false}
            animate={{
              x: pos * stepX + shift,
              y: lifted ? -20 : 0,
              rotateY: lifted || pos === 0 ? 0 : -9,
              scale: lifted ? 1.045 : pos === 0 ? 1 : 0.985,
            }}
            transition={spring}
          >
            <motion.img
              layoutId={`cover-${t.slug}`}
              src={t.cover}
              alt=""
              draggable={false}
              className="h-full w-full object-cover"
              transition={soft}
            />
            {started && ti === current && (
              <span className="absolute right-1.5 bottom-1.5 grid size-6 place-items-center rounded-full bg-black/55 text-white backdrop-blur">
                <Equaliser playing={playing} className="eq-sm" />
              </span>
            )}
          </motion.button>
        );
      })}

      {/* Tooltip for the cover you're pointing at */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            key="tip"
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1, x: Math.min(width - 170, hx + size * 0.55) }}
            exit={{ opacity: 0, y: 4, scale: 0.97, transition: { duration: 0.12 } }}
            transition={spring}
            className="glass-tip pointer-events-none absolute top-1 left-0 z-50 max-w-[190px] rounded-[14px] px-3 py-1.5"
          >
            <p className="truncate text-[12.5px] text-ink-3">{hovered.artist}</p>
            <p className="truncate text-[15px] font-medium text-ink">{hovered.title}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Under the stack: what's playing, with a quick way back to it. */
function NowPlayingStrip() {
  const started = useMusic((s) => s.started);
  const index = useMusic((s) => s.index);
  const playing = useMusic((s) => s.playing);
  const t = TRACKS[index];
  if (!started) {
    return <p className="mt-1 pl-1 text-[13px] text-ink-3">Pick a record. Drag the panel to the side to tuck it away; the music keeps playing.</p>;
  }
  return (
    <div className="mt-1 flex items-center gap-3">
      <button type="button" onClick={() => music.showTrack()} className="glass-pill flex min-w-0 flex-1 items-center gap-2.5 py-1.5 pr-3 pl-1.5 text-left">
        <Image src={t.cover} alt="" width={32} height={32} className="size-8 rounded-md object-cover" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium text-ink">{t.title}</span>
          <span className="block truncate text-[12px] text-ink-3">{t.artist}</span>
        </span>
      </button>
      <button type="button" onClick={() => music.toggle()} className="glass-pill grid size-11 place-items-center" aria-label={playing ? "Pause" : "Play"}>
        {playing ? <Pause className="size-[18px] fill-current" /> : <Play className="size-[18px] translate-x-px fill-current" />}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Screen 2: the record
// ---------------------------------------------------------------------------

function TrackScreen() {
  const index = useMusic((s) => s.index);
  const error = useMusic((s) => s.error);
  const t = TRACKS[index];

  return (
    <motion.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={spring}>
      <Header>
        <button type="button" onClick={() => music.back()} className="glass-pill inline-flex h-10 items-center gap-1 pr-4 pl-2.5 text-[15px] text-ink-2">
          <ChevronLeft className="size-[18px]" /> Back
        </button>
        <a
          href={youtubeUrl(t)}
          target="_blank"
          rel="noreferrer"
          className="glass-pill ml-auto inline-flex h-10 items-center gap-2 px-4 text-[15px] text-ink-2"
        >
          <YouTubeMark className="size-[18px]" /> See on YouTube <ArrowUpRight className="size-4 opacity-70" />
        </a>
      </Header>

      <div className="mt-6 flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-4">
        <Record track={t} />
        <div className="flex min-w-0 flex-1 flex-col items-center text-center">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={t.slug}
              initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
              transition={{ duration: 0.25 }}
              className="w-full"
            >
              <p className="truncate text-[15px] text-ink-3">{t.artist}</p>
              <p className="truncate text-[19px] font-medium tracking-[-0.01em] text-ink">{t.title}</p>
            </motion.div>
          </AnimatePresence>
          <TimePill />
          <Scrubber />
          <Transport />
        </div>
      </div>
      <p aria-live="polite" className="mt-3 min-h-[18px] text-center text-[12.5px] text-accent-text">
        {error}
      </p>
    </motion.div>
  );
}

/** The album sleeve with its vinyl, which slides out and spins while playing. Drag the vinyl to scrub. */
function Record({ track }: { track: Track }) {
  const playing = useMusic((s) => s.playing);
  const started = useMusic((s) => s.started);
  const reduce = useReducedMotion();
  const rotation = useMotionValue(0);
  const scratch = useRef<{ angle: number; acc: number; startTime: number } | null>(null);
  const [scrubPreview, setScrubPreview] = useState<number | null>(null);
  const [scratching, setScratching] = useState(false);
  const vinylRef = useRef<HTMLDivElement>(null);
  const size = 150;

  // 33⅓ rpm ≈ 200°/s, eased so it spins up and down like a real platter
  const speed = useRef(0);
  useAnimationFrame((_, delta) => {
    const target = playing && !reduce && !scratch.current ? 0.2 : 0;
    speed.current += (target - speed.current) * Math.min(1, delta / 260);
    if (speed.current > 0.0005) rotation.set((rotation.get() + speed.current * delta) % 360);
  });

  const angleAt = (e: ReactPointerEvent) => {
    const r = vinylRef.current!.getBoundingClientRect();
    return (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI;
  };

  return (
    <div className="relative shrink-0" style={{ width: size + 64, height: size }}>
      <motion.div
        ref={vinylRef}
        role="img"
        aria-label="Vinyl record. Drag it around to scrub through the song."
        data-no-drag
        className="vinyl absolute top-[5px] left-0 cursor-grab touch-none active:cursor-grabbing"
        style={{ width: size - 10, height: size - 10, rotate: rotation }}
        initial={false}
        animate={{ x: playing || scratching ? size * 0.5 : started ? size * 0.3 : size * 0.16 }}
        transition={soft}
        onPointerDown={(e) => {
          if (!started) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          scratch.current = { angle: angleAt(e), acc: 0, startTime: getMusic().time };
          setScratching(true);
        }}
        onPointerMove={(e) => {
          const s = scratch.current;
          if (!s) return;
          const a = angleAt(e);
          let d = a - s.angle;
          if (d > 180) d -= 360;
          if (d < -180) d += 360;
          s.angle = a;
          s.acc += d;
          rotation.set(rotation.get() + d);
          // One full turn of the record = 8 seconds of the song
          setScrubPreview(Math.max(0, s.startTime + (s.acc / 360) * 8));
        }}
        onPointerUp={() => {
          const s = scratch.current;
          scratch.current = null;
          if (s && Math.abs(s.acc) > 4) music.seek(s.startTime + (s.acc / 360) * 8);
          setScrubPreview(null);
          setScratching(false);
        }}
        onPointerCancel={() => {
          scratch.current = null;
          setScrubPreview(null);
          setScratching(false);
        }}
      >
        <span className="vinyl-label" style={{ backgroundImage: `url(${track.cover})` }} />
      </motion.div>
      <motion.img
        layoutId={`cover-${track.slug}`}
        src={track.cover}
        alt={`${track.album} cover`}
        draggable={false}
        className="cover-reflect relative z-10 rounded-[10px] object-cover shadow-[0_18px_36px_-16px_rgba(0,0,0,0.6),0_0_0_1px_rgba(0,0,0,0.25)]"
        style={{ width: size, height: size }}
        transition={soft}
      />
      <AnimatePresence>
        {scrubPreview !== null && (
          <motion.span
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass-tip absolute -top-3 right-0 z-20 rounded-full px-2.5 py-0.5 font-mono text-[12px] text-ink tabular-nums"
          >
            {clock(scrubPreview)}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

function TimePill() {
  const time = useMusic((s) => s.time);
  const duration = useMusic((s) => s.duration);
  return (
    <p className="glass-pill mt-3 inline-flex h-8 items-center gap-1.5 px-3.5 font-mono text-[14px] text-ink-2 tabular-nums">
      {clock(time)} <span className="text-ink-3">/</span> {clock(duration)}
    </p>
  );
}

/** Thin glass progress rail: click or drag to seek, arrow keys for ±5s. */
function Scrubber() {
  const time = useMusic((s) => s.time);
  const duration = useMusic((s) => s.duration);
  const started = useMusic((s) => s.started);
  const [drag, setDrag] = useState<number | null>(null);
  const rail = useRef<HTMLDivElement>(null);
  const shown = drag ?? time;
  const pct = duration > 0 ? Math.min(100, (shown / duration) * 100) : 0;

  const at = (e: ReactPointerEvent) => {
    const r = rail.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * duration;
  };

  return (
    <div
      ref={rail}
      role="slider"
      tabIndex={started ? 0 : -1}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(shown)}
      aria-valuetext={`${clock(shown)} of ${clock(duration)}`}
      aria-disabled={!started}
      onKeyDown={(e) => {
        if (!started) return;
        if (e.key === "ArrowRight" || e.key === "ArrowUp") music.seek(time + 5);
        else if (e.key === "ArrowLeft" || e.key === "ArrowDown") music.seek(time - 5);
        else if (e.key === "Home") music.seek(0);
        else return;
        e.preventDefault();
      }}
      onPointerDown={(e) => {
        if (!started || !duration) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag(at(e));
      }}
      onPointerMove={(e) => drag !== null && setDrag(at(e))}
      onPointerUp={() => {
        if (drag !== null) music.seek(drag);
        setDrag(null);
      }}
      className={`group relative mt-3 h-5 w-[min(100%,220px)] touch-none outline-none ${started ? "cursor-pointer" : "opacity-50"}`}
    >
      <span className="absolute inset-x-0 top-1/2 h-[5px] -translate-y-1/2 rounded-full bg-ink/10 shadow-[inset_0_1px_1px_rgba(0,0,0,0.12)]" />
      <span className="absolute top-1/2 left-0 h-[5px] -translate-y-1/2 rounded-full bg-ink/70" style={{ width: `${pct}%` }} />
      <span
        className="glass-knob absolute top-1/2 size-[15px] -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform group-hover:scale-110 group-focus-visible:scale-110"
        style={{ left: `${pct}%` }}
      />
    </div>
  );
}

function Transport() {
  const playing = useMusic((s) => s.playing);
  const loading = useMusic((s) => s.loading);
  return (
    <div className="glass-pill mt-3 inline-flex h-12 items-center gap-1 px-2">
      <button type="button" onClick={() => music.prev()} className="transport-btn" aria-label="Previous song">
        <Rewind className="size-[18px] fill-current" />
      </button>
      <button type="button" onClick={() => music.toggle()} className="transport-btn size-11" aria-label={playing ? "Pause" : "Play"}>
        {loading && !playing ? (
          <Loader2 className="size-5 animate-spin" />
        ) : playing ? (
          <Pause className="size-[21px] fill-current" />
        ) : (
          <Play className="size-[21px] translate-x-px fill-current" />
        )}
      </button>
      <button type="button" onClick={() => music.next()} className="transport-btn" aria-label="Next song">
        <FastForward className="size-[18px] fill-current" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tucked away: the tab on the left edge
// ---------------------------------------------------------------------------

function DockTab() {
  const index = useMusic((s) => s.index);
  const playing = useMusic((s) => s.playing);
  const time = useMusic((s) => s.time);
  const duration = useMusic((s) => s.duration);
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const filterId = `lg-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
  const glass = useLiquidGlass(ref, filterId, { radius: 26, edge: 14, strength: 40, blur: 10 });
  const t = TRACKS[index];
  const pct = duration > 0 ? time / duration : 0;
  const R = 25;
  const C = 2 * Math.PI * R;

  return (
    <div className="pointer-events-none fixed inset-y-0 left-0 z-[45] flex items-center">
      {glass.filter}
      <motion.div
        ref={ref}
        onPointerMove={trackSpecular}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0, right: 0.5 }}
        onDragEnd={(_, info) => (info.offset.x > 40 || info.velocity.x > 400) && music.open()}
        initial={reduce ? { opacity: 0 } : { x: -90, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={reduce ? { opacity: 0 } : { x: -90, opacity: 0 }}
        transition={soft}
        style={glass.style}
        className="liquid-glass group pointer-events-auto relative flex touch-pan-y flex-col items-center gap-2 rounded-r-[26px] py-3 pr-2.5 pl-2"
      >
        <button type="button" onClick={() => music.open()} className="relative grid size-[58px] place-items-center" aria-label={`Open the music player. Now playing ${t.title} by ${t.artist}`}>
          {/* progress ring */}
          <svg viewBox="0 0 58 58" className="absolute inset-0 -rotate-90" aria-hidden>
            <circle cx="29" cy="29" r={R} fill="none" stroke="currentColor" strokeWidth="2.5" className="text-ink/10" />
            <circle cx="29" cy="29" r={R} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-ink/70" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} />
          </svg>
          <span className={`vinyl vinyl-mini ${playing && !reduce ? "vinyl-spin" : ""}`}>
            <span className="vinyl-label" style={{ backgroundImage: `url(${t.cover})` }} />
          </span>
        </button>
        <button type="button" onClick={() => music.toggle()} className="glass-pill grid size-9 place-items-center" aria-label={playing ? "Pause" : "Play"}>
          {playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 translate-x-px fill-current" />}
        </button>
        <button type="button" onClick={() => music.next()} className="grid size-8 place-items-center rounded-full text-ink-2 transition hover:text-ink" aria-label="Next song">
          <FastForward className="size-4 fill-current" />
        </button>
        {/* Title flag, shown on hover */}
        <span className="glass-tip pointer-events-none absolute top-1/2 left-full ml-2 -translate-y-1/2 rounded-[12px] px-3 py-1.5 whitespace-nowrap opacity-0 transition group-hover:opacity-100">
          <span className="block text-[12px] text-ink-3">{t.artist}</span>
          <span className="block text-[14px] font-medium text-ink">{t.title}</span>
        </span>
      </motion.div>
    </div>
  );
}

function YouTubeMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="#ff0033"
        d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8Z"
      />
      <path fill="#fff" d="m9.6 15.6 6.2-3.6-6.2-3.6v7.2Z" />
    </svg>
  );
}
