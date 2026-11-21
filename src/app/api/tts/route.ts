import { z } from "zod";
import { getPortfolioContent } from "@/lib/content/queries";
import { MOODS, speechText, type Mood } from "@/lib/assistant/protocol";
import { buildLines, chatGreeting } from "@/lib/assistant/tour";
import {
  BudgetExceededError,
  FALLBACK_MODEL,
  MIKURO_VOICE_ID,
  audioCacheKey,
  cachedSpeech,
  resolveVoice,
  supportsAudioTags,
  verifySpeech,
  voiceFingerprint,
  voiceSettings,
  type VoiceConfig,
} from "@/lib/assistant/voice-server";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { getAdminSession } from "@/lib/supabase/server";
import type { PortfolioContent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const api = () => process.env.ELEVENLABS_API_BASE || "https://api.elevenlabs.io/v1";

// Expressive audio tags for models that understand them (v3 / v4 family)
const MOOD_TAG: Record<Mood, string> = {
  happy: "[cheerfully]",
  excited: "[excited]",
  curious: "[curious]",
  gentle: "[softly]",
  playful: "[playfully]",
  thinking: "[thoughtful]",
  confused: "[confused]",
  surprised: "[surprised]",
};

// Per-mood nudges on top of the base voice settings
const MOOD_STYLE: Record<Mood, { stability: number; style: number }> = {
  happy: { stability: 0, style: 0.05 },
  excited: { stability: -0.1, style: 0.2 },
  curious: { stability: -0.05, style: 0.1 },
  gentle: { stability: 0.15, style: -0.15 },
  playful: { stability: -0.05, style: 0.15 },
  thinking: { stability: 0.1, style: -0.1 },
  confused: { stability: 0, style: 0.05 },
  surprised: { stability: -0.1, style: 0.2 },
};

/** Tells the browser whether the real voice is available. Costs no credits. */
export async function GET() {
  const { content } = await getPortfolioContent().catch(() => ({ content: null }));
  const cfg = content ? resolveVoice(content.assistant) : null;
  return Response.json(
    {
      elevenlabs: Boolean(cfg),
      voiceKey: cfg ? voiceFingerprint(cfg) : null,
      // Lets the browser reject pre-generated clips recorded with another voice
      voiceId: cfg?.voiceId ?? (process.env.ELEVENLABS_VOICE_ID?.trim() || content?.assistant.voice_id || MIKURO_VOICE_ID),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

const Body = z.object({
  text: z.string().trim().min(1).max(900),
  mood: z.enum(MOODS).default("happy"),
  signature: z.string().regex(/^[a-f0-9]{40}$/).optional(),
});

/** Scripted lines the site itself speaks (no signature needed). */
function isScripted(text: string, content: PortfolioContent) {
  if (text === speechText(chatGreeting(content))) return true;
  return Object.values(buildLines(content)).some((line) => line.texts.some((t) => speechText(t) === text));
}

async function synthesize(cfg: VoiceConfig, model: string, text: string, mood: Mood) {
  return fetch(`${api()}/text-to-speech/${encodeURIComponent(cfg.voiceId)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": cfg.key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text: supportsAudioTags(model) ? `${MOOD_TAG[mood]} ${text}` : text,
      model_id: model,
      voice_settings: voiceSettings(cfg, model, MOOD_STYLE[mood]),
    }),
    signal: AbortSignal.timeout(20_000),
  });
}

class ProviderError extends Error {
  constructor(readonly status: number) {
    super(`ElevenLabs responded ${status}`);
  }
}

async function generate(cfg: VoiceConfig, text: string, mood: Mood) {
  let res = await synthesize(cfg, cfg.model, text, mood);
  // Model not available on this plan: same voice, widely available model.
  // Auth, quota and rate-limit errors are never retried, so they can't double-spend.
  if ([400, 403, 404, 422].includes(res.status) && cfg.model !== FALLBACK_MODEL) {
    console.warn(`[tts] ${cfg.model} failed with ${res.status}; retrying with ${FALLBACK_MODEL}`);
    res = await synthesize(cfg, FALLBACK_MODEL, text, mood);
  }
  if (!res.ok) {
    console.error("[tts] ElevenLabs error", res.status, (await res.text().catch(() => "")).slice(0, 300));
    throw new ProviderError(res.status);
  }
  return new Uint8Array(await res.arrayBuffer());
}

export async function POST(req: Request) {
  const limit = rateLimit(clientKey(req, "tts"), 12, 60_000);
  if (!limit.ok) {
    return Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });

  const { content } = await getPortfolioContent();
  const cfg = resolveVoice(content.assistant);
  if (!cfg) return Response.json({ error: "not_configured" }, { status: 503 });

  const { mood, signature } = parsed.data;
  const text = speechText(parsed.data.text);
  if (!text) return Response.json({ error: "invalid" }, { status: 400 });
  // Admins can test unsaved greetings from the dashboard
  const allowed = isScripted(text, content) || verifySpeech(text, signature) || (await getAdminSession()).isAdmin;
  if (!allowed) {
    return Response.json({ error: "unsigned_text" }, { status: 403 });
  }

  try {
    const key = audioCacheKey(voiceFingerprint(cfg), mood, text);
    const { audio, cached } = await cachedSpeech(key, text.length, () => generate(cfg, text, mood));
    return new Response(audio.slice().buffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, max-age=86400",
        "X-Voice-Cache": cached ? "hit" : "miss",
      },
    });
  } catch (err) {
    if (err instanceof BudgetExceededError) return Response.json({ error: "daily_budget" }, { status: 429 });
    if (err instanceof ProviderError) {
      const error = err.status === 401 ? "bad_key" : err.status === 402 ? "out_of_credits" : "provider_error";
      return Response.json({ error }, { status: 502 });
    }
    console.error("[tts] request failed", err);
    return Response.json({ error: "provider_unreachable" }, { status: 502 });
  }
}
