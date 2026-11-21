import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AssistantSettings } from "../types";
import type { Mood } from "./protocol";

/** Mikuro's permanent voice. ELEVENLABS_VOICE_ID overrides it. */
export const MIKURO_VOICE_ID = "MARYu78aD29mxoS37XE3";
/** Expressive, supports audio tags, and costs half as much per character as v3. */
export const DEFAULT_MODEL = "eleven_v3_conversational";
export const FALLBACK_MODEL = "eleven_flash_v2_5";
/** The old database default, treated as "not chosen" so the better default applies. */
const LEGACY_DEFAULT_MODEL = "eleven_v3";
const DEFAULT_SPEED = 0.96;
const DEFAULT_DAILY_CHARS = 2000;

const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const envNumber = (name: string) => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

export const supportsAudioTags = (model: string) => /v3|v4/i.test(model);
/** The v3 family accepts only three stability presets. */
const isV3 = (model: string) => /v3/i.test(model);
const snapStability = (n: number) => (n < 0.25 ? 0 : n < 0.75 ? 0.5 : 1);

export type VoiceConfig = {
  key: string;
  voiceId: string;
  model: string;
  stability: number;
  similarity: number;
  style: number;
  speed: number;
};

/**
 * Resolution order: environment variables, then the admin settings, then
 * Mikuro's defaults. The env voice always wins, so a stale admin value can't
 * silently change the character's voice.
 */
export function resolveVoice(a: AssistantSettings): VoiceConfig | null {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key || !a.voice_enabled || a.voice_provider === "browser") return null;
  const savedModel = a.voice_model && a.voice_model !== LEGACY_DEFAULT_MODEL ? a.voice_model : "";
  return {
    key,
    voiceId: process.env.ELEVENLABS_VOICE_ID?.trim() || a.voice_id || MIKURO_VOICE_ID,
    model: process.env.ELEVENLABS_MODEL_ID?.trim() || savedModel || DEFAULT_MODEL,
    stability: clamp(envNumber("ELEVENLABS_STABILITY") ?? a.voice_stability),
    similarity: clamp(envNumber("ELEVENLABS_SIMILARITY") ?? 0.8),
    style: clamp(envNumber("ELEVENLABS_STYLE") ?? a.voice_style),
    // 1.0 is the old default and sounds rushed for this character
    speed: clamp(envNumber("ELEVENLABS_SPEED") ?? (a.voice_speed === 1 ? DEFAULT_SPEED : a.voice_speed), 0.7, 1.2),
  };
}

export function voiceSettings(cfg: VoiceConfig, model: string, nudge: { stability: number; style: number }) {
  const stability = clamp(cfg.stability + nudge.stability);
  return {
    stability: isV3(model) ? snapStability(stability) : stability,
    similarity_boost: cfg.similarity,
    style: clamp(cfg.style + nudge.style),
    use_speaker_boost: true,
    speed: cfg.speed,
  };
}

/** Changes whenever the sound would change, which invalidates cached audio. */
export function voiceFingerprint(c: VoiceConfig) {
  return createHash("sha256")
    .update([c.voiceId, c.model, c.stability, c.similarity, c.style, c.speed].join("|"))
    .digest("hex")
    .slice(0, 16);
}

// ---------------------------------------------------------------------------
// Signed speech: /api/tts only voices text this server produced, so nobody can
// use the public endpoint to spend the owner's credits on arbitrary text.
// ---------------------------------------------------------------------------
const signingKey = () => {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  return key ? createHash("sha256").update(`mikuro-speech-signing:${key}`).digest() : null;
};

export function signSpeech(text: string) {
  const key = signingKey();
  return key ? createHmac("sha256", key).update(text).digest("hex").slice(0, 40) : null;
}

export function verifySpeech(text: string, signature: string | undefined) {
  if (!signature) return false;
  const expected = signSpeech(text);
  if (!expected || expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// ---------------------------------------------------------------------------
// Audio cache: memory first, then disk. Identical lines never cost credits twice.
// ---------------------------------------------------------------------------
const MAX_MEMORY_BYTES = 32 * 1024 * 1024;
const memory = new Map<string, Uint8Array>();
let memoryBytes = 0;
const inFlight = new Map<string, Promise<Uint8Array>>();
const diskDir = join(tmpdir(), "mikuro-tts");

export const audioCacheKey = (fingerprint: string, mood: Mood, text: string) =>
  createHash("sha256").update(`${fingerprint}|${mood}|${text}`).digest("hex");

function remember(key: string, audio: Uint8Array) {
  memoryBytes -= memory.get(key)?.byteLength ?? 0;
  memory.delete(key);
  memory.set(key, audio);
  memoryBytes += audio.byteLength;
  while (memoryBytes > MAX_MEMORY_BYTES) {
    const oldest = memory.keys().next().value;
    if (oldest === undefined) break;
    memoryBytes -= memory.get(oldest)?.byteLength ?? 0;
    memory.delete(oldest);
  }
}

async function readCached(key: string) {
  const hot = memory.get(key);
  if (hot) {
    memory.delete(key);
    memory.set(key, hot); // most recently used
    return hot;
  }
  try {
    const file = new Uint8Array(await readFile(join(diskDir, `${key}.mp3`)));
    remember(key, file);
    return file;
  } catch {
    return null;
  }
}

async function writeCached(key: string, audio: Uint8Array) {
  remember(key, audio);
  try {
    await mkdir(diskDir, { recursive: true });
    await writeFile(join(diskDir, `${key}.mp3`), audio);
  } catch {
    /* read-only filesystem: the memory cache still works */
  }
}

// ---------------------------------------------------------------------------
// Daily character budget (per server instance), a backstop for the credits.
// ---------------------------------------------------------------------------
const budget = { day: "", used: 0 };

export function reserveBudget(chars: number) {
  const limit = envNumber("ELEVENLABS_DAILY_CHAR_LIMIT") ?? DEFAULT_DAILY_CHARS;
  const day = new Date().toISOString().slice(0, 10);
  if (budget.day !== day) Object.assign(budget, { day, used: 0 });
  if (budget.used + chars > limit) return false;
  budget.used += chars;
  return true;
}

export function refundBudget(chars: number) {
  budget.used = Math.max(0, budget.used - chars);
}

export class BudgetExceededError extends Error {}

/** Returns cached audio, or generates it once even if requested concurrently. */
export async function cachedSpeech(key: string, chars: number, generate: () => Promise<Uint8Array>) {
  const hit = await readCached(key);
  if (hit) return { audio: hit, cached: true };

  const running = inFlight.get(key);
  if (running) return { audio: await running, cached: true };

  if (!reserveBudget(chars)) throw new BudgetExceededError();
  const job = generate()
    .then(async (audio) => {
      await writeCached(key, audio);
      return audio;
    })
    .catch((err) => {
      refundBudget(chars);
      throw err;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, job);
  return { audio: await job, cached: false };
}
