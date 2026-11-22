"use client";

import { useEffect } from "react";
import { useAssistant } from "../momo/AssistantProvider";
import { currentFestival } from "@/lib/festivals";
import { FESTIVE_LINES } from "./social/lines";

/** Mikuro wishes a festive line, once per session, while a festival is on. */
export function FestiveQuip() {
  const { showQuip } = useAssistant();
  useEffect(() => {
    const f = currentFestival();
    if (!f) return;
    const key = `festive-quip-${f.id}`;
    try {
      if (sessionStorage.getItem(key)) return;
    } catch {}
    // after the intro, once the page has settled
    const id = setTimeout(() => {
      const line = FESTIVE_LINES[f.id];
      const shown = showQuip({ id: key, mood: line.mood, text: line.text });
      if (shown) {
        try {
          sessionStorage.setItem(key, "1");
        } catch {}
      }
    }, 9000);
    return () => clearTimeout(id);
  }, [showQuip]);
  return null;
}
