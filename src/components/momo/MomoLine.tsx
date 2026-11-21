"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import type { SectionId } from "@/lib/assistant/protocol";
import { useAssistant } from "./AssistantProvider";
import { getLineProgress, subscribeLineProgress } from "./lineProgress";

/**
 * Momo's spot in a section: the landing pad she flies to, plus her line as
 * karaoke text (spoken words turn dark, the rest stay muted).
 */
export function MomoLine({
  id,
  align = "left",
  size = 64,
  className = "",
}: {
  id: SectionId;
  align?: "left" | "right" | "center";
  size?: number;
  className?: string;
}) {
  const a = useAssistant();
  const ref = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const spec = a.lines[id];
  const st = a.lineState[id];

  const { focusLine } = a;
  // Tell the assistant when this line is the one in focus
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && focusLine(id), {
      rootMargin: "-8% 0px -35% 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [focusLine, id]);

  const index = st?.index ?? 0;
  const done = Boolean(st?.done);
  // Karaoke runs every frame, so words are lit directly instead of re-rendering
  useLayoutEffect(() => {
    const host = textRef.current;
    if (!host) return;
    const paint = () => {
      const items = host.querySelectorAll<HTMLElement>(".line-word");
      const lit = Math.ceil((done ? 1 : getLineProgress(id)) * items.length);
      items.forEach((w, i) => w.toggleAttribute("data-lit", i < lit));
    };
    paint();
    return subscribeLineProgress(id, paint);
  }, [id, index, done]);

  if (!spec) return null;
  const text = spec.texts[index] ?? spec.texts[0];
  const words = text.split(" ");
  const started = Boolean(st);

  return (
    <div
      ref={ref}
      data-momo-line={id}
      className={`flex items-center gap-3 ${align === "right" ? "flex-row-reverse text-right" : ""} ${
        align === "center" ? "mx-auto justify-center" : ""
      } ${className}`}
    >
      <div
        data-momo-anchor={`line-${id}`}
        aria-hidden
        className="shrink-0"
        style={{ width: size, height: size }}
      />
      <p
        ref={textRef}
        className={`max-w-[300px] text-[15px] leading-[1.45] transition-opacity duration-500 ${started ? "opacity-100" : "opacity-0"}`}
        aria-live={a.activeLine === id ? "polite" : "off"}
      >
        <span className="sr-only">{a.settings.name} says: </span>
        {words.map((w, i) => (
          <span key={`${index}-${i}`} className="line-word">
            {w}{" "}
          </span>
        ))}
      </p>
    </div>
  );
}
