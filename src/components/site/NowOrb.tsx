"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useAssistant } from "../momo/AssistantProvider";

/**
 * A tiny live orb in the top-left corner: it pulses when Pushkar is coding
 * right now (a push or PR in the last half hour), glows warm if he shipped
 * something today, and goes quiet otherwise. Powered by /api/github/now.
 */
type Now = { at: string | null; repo: string | null; kind: string | null; message: string | null; url: string | null };

export const NOW_LINES = {
  live: { mood: "playful", text: "He's typing right now. Don't distract him." },
} as const;

const LIVE_MS = 30 * 60_000;
const WARM_MS = 8 * 3600_000;
const POLL_MS = 2 * 60_000;

function ago(ms: number) {
  const m = Math.round(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

const VERB: Record<string, string> = { push: "pushed to", pr: "worked on a PR in", create: "started", other: "was active on" };

export function NowOrb() {
  const a = useAssistant();
  const [now, setNow] = useState<Now | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const [open, setOpen] = useState(false);
  const said = useRef(false);
  const live = useRef(a);
