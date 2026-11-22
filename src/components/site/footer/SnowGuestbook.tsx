"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent, type RefObject } from "react";
import { useAssistant } from "../../momo/AssistantProvider";
import { SOCIAL_LINES } from "../social/lines";
import type { SnowMarks } from "./snowMarks";
import type { SnowScene } from "./SnowScene";
import { MARK_KINDS, useSnowMarks } from "./useSnowMarks";

type Mode = "idle" | "pick" | "place";

/**
 * "Leave a mark": the guestbook in the snow. Pick one of 4 fixed marks, then
 * tap the snow (or let it be placed for you). Everyone sees everyone's marks.
 */
export function SnowGuestbook({ sceneRef, ready, dim }: { sceneRef: RefObject<SnowScene | null>; ready: boolean; dim: boolean }) {
  const { showQuip } = useAssistant();
  const marks = useSnowMarks(ready);
  const layer = useRef<SnowMarks | null>(null);
  const [layerReady, setLayerReady] = useState(false);
  const [mode, setMode] = useState<Mode>("idle");
  const [kind, setKind] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const randomRef = useRef<HTMLButtonElement>(null);
  const firstKindRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);

  // The 3D layer lives in the igloo's scene (three is only loaded with it)
  useEffect(() => {
    if (!ready) return;
    let dead = false;
    let l: SnowMarks | null = null;
    void import("./snowMarks").then(({ SnowMarks }) => {
      const scene = sceneRef.current;
      if (dead || !scene) return;
      l = new SnowMarks(scene, matchMedia("(prefers-reduced-motion: reduce)").matches);
      layer.current = l;
      setLayerReady(true);
    });
    return () => {
      dead = true;
      l?.dispose();
      layer.current = null;
    };
  }, [ready, sceneRef]);

  useEffect(() => {
    if (layerReady) layer.current?.set(marks.items, marks.settled);
  }, [layerReady, marks.items, marks.settled]);

  useEffect(() => {
    if (mode === "pick") firstKindRef.current?.focus();
    if (mode === "place") randomRef.current?.focus();
  }, [mode]);

  useEffect(() => {
    if (mode === "idle") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMode("idle");
      openRef.current?.focus();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [mode]);

  const submit = useCallback(
    async (x: number, z: number) => {
      setBusy(true);
      const res = await marks.leave(kind, x, z);
      setBusy(false);
      setMode("idle");
      const name = MARK_KINDS[kind]?.name ?? "mark";
      if (res === "rate_limited") {
        setStatus("The snow is full of your marks for now. Try again in a few minutes.");
        return;
      }
      setStatus(`Your ${name} ${kind === 1 ? "are" : "is"} in the snow${res === "local" ? " (saved on this device)" : ""}.`);
      const line = res === "local" ? SOCIAL_LINES.snowMarkLocal : SOCIAL_LINES.snowMark;
      showQuip({ id: res === "local" ? "snowMarkLocal" : "snowMark", ...line });
    },
    [kind, marks, showQuip],
  );

  const placeAt = (e: MouseEvent<HTMLDivElement>) => {
    if (busy || !layer.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    const spot = layer.current.pick(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
    if (!spot) {
      setStatus("Not there: keep it on open snow, away from the igloo and its door.");
      return;
    }
    void submit(spot.x, spot.z);
  };

  const placeRandom = () => {
    if (busy) return;
    const spot = layer.current?.randomSpot();
    if (!spot) {
      setStatus("Couldn't find a free patch of snow. Try tapping one.");
      return;
    }
    void submit(spot.x, spot.z);
  };

  if (!ready) return null;
  const hud = dim ? "text-white/80" : "text-[#20252d]/75";
  const soft = dim ? "text-white/55" : "text-[#20252d]/50";
  const chip = `rounded-full border px-2.5 py-1 transition outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none ${
    dim ? "border-white/25 bg-black/35 hover:bg-black/50" : "border-[#20252d]/20 bg-white/45 hover:bg-white/70"
  }`;
  const total = marks.total;

  return (
    <>
      {mode === "place" && (
        <div
          role="presentation"
          onClick={placeAt}
          className="absolute inset-0 cursor-crosshair"
          title={`Click the snow to leave your ${MARK_KINDS[kind]?.name}`}
        />
      )}

      <div className={`absolute right-4 bottom-24 flex max-w-[60vw] flex-col items-end gap-1.5 text-right font-mono text-[11px] leading-[1.6] sm:right-8 sm:bottom-28 sm:max-w-none sm:text-[12px] ${hud}`}>
        <p className={soft}>
          {total} {total === 1 ? "mark" : "marks"} in the snow
          {!marks.configured && total > 0 ? " · on this device" : ""}
        </p>

        {mode === "idle" && (
          <button ref={openRef} type="button" onClick={() => setMode("pick")} disabled={!layerReady} className={chip}>
            <span aria-hidden>❄ </span>Leave a mark
          </button>
        )}

        {mode === "pick" && (
          <div role="group" aria-label="Pick a mark to leave in the snow" className="flex flex-wrap justify-end gap-1.5">
            {MARK_KINDS.map((m, i) => (
              <button
                key={m.name}
                ref={i === 0 ? firstKindRef : undefined}
                type="button"
                onClick={() => {
                  setKind(i);
                  setMode("place");
                }}
                className={chip}
              >
                <span aria-hidden>{m.glyph} </span>
                {m.name}
              </button>
            ))}
            <button type="button" onClick={() => setMode("idle")} className={`${chip} ${soft}`}>
              Cancel
            </button>
          </div>
        )}

        {mode === "place" && (
          <div className="flex flex-col items-end gap-1.5">
            <p>
              <span aria-hidden>{MARK_KINDS[kind]?.glyph} </span>
              {busy ? "Pressing it into the snow…" : `Tap the snow to leave your ${MARK_KINDS[kind]?.name}`}
            </p>
            <div className="flex gap-1.5">
              <button ref={randomRef} type="button" onClick={placeRandom} disabled={busy} className={chip}>
                Place it for me
              </button>
              <button type="button" onClick={() => setMode("idle")} disabled={busy} className={`${chip} ${soft}`}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <p aria-live="polite" className={`max-w-[34ch] ${soft} ${status ? "" : "sr-only"}`}>
          {status}
        </p>
      </div>
    </>
  );
}
