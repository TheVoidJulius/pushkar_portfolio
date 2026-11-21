import lines from "./mikuro-lines.json";
import type { Mood } from "./protocol";

/** The character's high-level state, derived from everything it is doing. */
export const MIKURO_STATES = [
  "idle",
  "listening",
  "speaking",
  "thinking",
  "happy",
  "curious",
  "surprised",
  "coffee",
  "sleeping",
] as const;
export type MikuroState = (typeof MIKURO_STATES)[number];

/** Autonomous bits of business Mikuro does on its own. */
export type MikuroAct = "coffee" | "yawning" | "stretching" | "lookaround";

export type Quip = { id: string; mood: Mood; text: string };
export type QuipTrigger = keyof typeof lines;

export const QUIPS = lines as unknown as Record<QuipTrigger, Quip[]>;

/** Things the page tells Mikuro about. */
export type MikuroEvent = "hover" | "click";

const recent: string[] = [];

/** Random line for a trigger, avoiding anything said recently. */
export function pickQuip(trigger: QuipTrigger): Quip | null {
  const pool = QUIPS[trigger];
  if (!pool?.length) return null;
  const fresh = pool.filter((q) => !recent.includes(q.id));
  const from = fresh.length ? fresh : pool;
  const quip = from[Math.floor(Math.random() * from.length)];
  recent.push(quip.id);
  if (recent.length > 12) recent.shift();
  return quip;
}
