"use client";

import { useEffect, useRef, useState } from "react";

type Vitals = { lcp?: number; cls: number; inp?: number };

const SHORTCUTS: [string, string][] = [
  ["Esc", "Close dialogs and this panel"],
  ["Tab", "Move through links and controls"],
  ["meow", "Say hi to Mikuro"],
  ["sudo hire pushkar", "Take the shortcut"],
  ["↑↑↓↓←→←→ B A", "You found this"],
];

const COMMIT = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA;

function rendererName() {
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    return gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : gl ? "WebGL (masked)" : "no WebGL";
  } catch {
    return "unavailable";
  }
}

/** Small closable developer overlay: live FPS, GPU, heap, Web Vitals, shortcuts. */
export default function DevMode({ onClose }: { onClose: () => void }) {
  const [fps, setFps] = useState(0);
  const [heap, setHeap] = useState<string | null>(null);
  const [v, setV] = useState<Vitals>({ cls: 0 });
  const [gpu] = useState(rendererName);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let raf = 0;
    let frames = 0;
    let last = performance.now();
    const loop = (t: number) => {
      frames++;
      if (t - last >= 500) {
        setFps(Math.round((frames * 1000) / (t - last)));
        frames = 0;
        last = t;
        const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
        if (m) setHeap(`${(m.usedJSHeapSize / 1048576).toFixed(1)} MB`);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const obs: PerformanceObserver[] = [];
    const watch = (type: string, cb: (e: PerformanceEntry & Record<string, number | boolean>) => void, extra?: object) => {
      try {
        const o = new PerformanceObserver((l) => l.getEntries().forEach((e) => cb(e as never)));
        o.observe({ type, buffered: true, ...extra } as PerformanceObserverInit);
        obs.push(o);
      } catch {
        /* entry type unsupported in this browser */
      }
    };
    watch("largest-contentful-paint", (e) => setV((p) => ({ ...p, lcp: e.startTime })));
    watch("layout-shift", (e) => {
      if (!e.hadRecentInput) setV((p) => ({ ...p, cls: p.cls + (e.value as number) }));
    });
    watch("event", (e) => setV((p) => ({ ...p, inp: Math.max(p.inp ?? 0, e.duration) })), { durationThreshold: 40 });
    return () => obs.forEach((o) => o.disconnect());
  }, []);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const ms = (n?: number) => (n === undefined ? "n/a" : `${Math.round(n)} ms`);
  const rows: [string, string][] = [
    ["FPS", String(fps)],
    ["GPU", gpu],
    ["JS heap", heap ?? "n/a"],
    ["LCP", ms(v.lcp)],
    ["CLS", v.cls.toFixed(3)],
    ["INP", v.inp === undefined ? "interact first" : ms(v.inp)],
    ...(COMMIT ? ([["Commit", COMMIT.slice(0, 7)]] as [string, string][]) : []),
  ];

  return (
    <aside
      role="dialog"
      aria-label="Developer mode"
      className="fixed top-20 right-3 z-[60] w-[min(21rem,calc(100vw-1.5rem))] rounded-2xl border border-[color:var(--accent)]/40 bg-[color:var(--bg-elevated)]/90 p-4 font-mono text-xs shadow-2xl backdrop-blur-xl"
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[color:var(--accent-text)]">&gt; developer_mode</span>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close developer mode"
          className="rounded-full px-2 py-0.5 opacity-70 transition hover:opacity-100 focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:outline-none"
        >
          {"✕"}
        </button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {rows.map(([k, val]) => (
          <div key={k} className="contents">
            <dt className="opacity-60">{k}</dt>
            <dd className="truncate text-right" title={val}>
              {val}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 mb-1 opacity-60">shortcuts</p>
      <ul className="space-y-1">
        {SHORTCUTS.map(([k, d]) => (
          <li key={k} className="flex justify-between gap-3">
            <kbd className="text-[color:var(--accent-text)]">{k}</kbd>
            <span className="text-right opacity-80">{d}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
