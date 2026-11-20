import { getAdminSession } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Owner-only: lists the voices and models on the ElevenLabs account so the
 * owner can pick one from a dropdown. The API key never leaves the server.
 */
const score = (labels: Record<string, string> | undefined) =>
  (/japan/i.test(labels?.accent ?? "") ? 2 : 0) + (/female|woman/i.test(labels?.gender ?? "") ? 1 : 0);

export async function GET() {
  const { isAdmin } = await getAdminSession();
  if (!isAdmin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return Response.json({ configured: false, voices: [], models: [] });

  try {
    const headers = { "xi-api-key": key };
    const [vRes, mRes] = await Promise.all([
      fetch("https://api.elevenlabs.io/v1/voices", { headers, signal: AbortSignal.timeout(10_000) }),
      fetch("https://api.elevenlabs.io/v1/models", { headers, signal: AbortSignal.timeout(10_000) }),
    ]);
    if (!vRes.ok) {
      return Response.json(
        { configured: true, error: `ElevenLabs returned ${vRes.status}. Check the API key.`, voices: [], models: [] },
        { status: 502 },
      );
    }
    const voicesJson = (await vRes.json()) as {
      voices: { voice_id: string; name: string; labels?: Record<string, string>; preview_url?: string; category?: string }[];
    };
    const modelsJson = mRes.ok
      ? ((await mRes.json()) as { model_id: string; name: string; can_do_text_to_speech?: boolean }[])
      : [];
    return Response.json({
      configured: true,
      // Japanese-accent female voices first, then other female voices
      voices: [...voicesJson.voices]
        .sort((a, b) => score(b.labels) - score(a.labels) || a.name.localeCompare(b.name))
        .map((v) => ({
        id: v.voice_id,
        name: v.name,
        category: v.category ?? "",
        labels: v.labels ?? {},
        preview: v.preview_url ?? null,
      })),
      models: modelsJson.filter((m) => m.can_do_text_to_speech !== false).map((m) => ({ id: m.model_id, name: m.name })),
    });
  } catch {
    return Response.json({ configured: true, error: "Couldn't reach ElevenLabs.", voices: [], models: [] }, { status: 502 });
  }
}
