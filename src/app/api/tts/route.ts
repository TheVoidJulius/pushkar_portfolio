import { z } from "zod";
import { getPortfolioContent } from "@/lib/content/queries";
import { MOODS, cleanForSpeech, type Mood } from "@/lib/assistant/protocol";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API = "https://api.elevenlabs.io/v1";
const FALLBACK_MODEL = "eleven_multilingual_v2";

// Expressive audio tags for models that understand them (Eleven v3 / v4 family)
const MOOD_TAG: Record<Mood, string> = {
  happy: "[happy]",
  excited: "[excited]",
  curious: "[curious]",
  gentle: "[softly]",
  playful: "[playfully]",
  thinking: "[thoughtful]",
  confused: "[confused]",
  surprised: "[surprised]",
};

// Per-mood nudges on top of the owner's voice settings
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

const supportsAudioTags = (model: string) => /v3|v4/i.test(model);
const clamp = (n: number) => Math.max(0, Math.min(1, n));

async function voiceConfig() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return null;
  const { content } = await getPortfolioContent();
  const a = content.assistant;
  const voiceId = a.voice_id || process.env.ELEVENLABS_VOICE_ID || "";
  if (!voiceId || a.voice_provider === "browser" || !a.voice_enabled) return null;
  return { key, voiceId, assistant: a };
}

/** Lets the browser decide up front whether to use ElevenLabs or speechSynthesis. */
export async function GET() {
  const cfg = await voiceConfig().catch(() => null);
  return Response.json({ elevenlabs: Boolean(cfg) }, { headers: { "Cache-Control": "no-store" } });
}

const Body = z.object({
  text: z.string().trim().min(1).max(900),
  mood: z.enum(MOODS).default("happy"),
});

export async function POST(req: Request) {
  const limit = rateLimit(clientKey(req, "tts"), 30, 60_000);
  if (!limit.ok) return Response.json({ error: "rate_limited", fallback: true }, { status: 429 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });

  const cfg = await voiceConfig().catch(() => null);
  if (!cfg) return Response.json({ error: "not_configured", fallback: true }, { status: 503 });

  const { key, voiceId, assistant } = cfg;
  const { mood } = parsed.data;
  const text = cleanForSpeech(parsed.data.text);
  const nudge = MOOD_STYLE[mood];

  const synth = (model: string) =>
    fetch(`${API}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text: supportsAudioTags(model) ? `${MOOD_TAG[mood]} ${text}` : text,
        model_id: model,
        voice_settings: {
          stability: clamp(assistant.voice_stability + nudge.stability),
          similarity_boost: 0.8,
          style: clamp(assistant.voice_style + nudge.style),
          use_speaker_boost: true,
          speed: assistant.voice_speed,
        },
      }),
      signal: AbortSignal.timeout(20_000),
    });

  try {
    const model = assistant.voice_model || "eleven_v3";
    let res = await synth(model);
    // Configured model unavailable on this plan? Retry with the widely available one.
    if (!res.ok && res.status !== 401 && res.status !== 429 && model !== FALLBACK_MODEL) {
      console.warn(`[tts] ${model} failed with ${res.status}; retrying with ${FALLBACK_MODEL}`);
      res = await synth(FALLBACK_MODEL);
    }
    if (!res.ok || !res.body) {
      console.error("[tts] ElevenLabs error", res.status, await res.text().catch(() => ""));
      return Response.json({ error: "provider_error", fallback: true }, { status: 502 });
    }
    return new Response(res.body, {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" },
    });
  } catch (err) {
    console.error("[tts] request failed", err);
    return Response.json({ error: "provider_unreachable", fallback: true }, { status: 502 });
  }
}
