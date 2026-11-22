import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ blossom: z.number().int().min(0).max(7) });

// Stateless anon client: RLS is the only gate (select + range-checked insert).
const db = () => createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

export async function GET() {
  if (!isSupabaseConfigured) return Response.json({ configured: false, count: 0, items: [] });
  try {
    const s = db();
    const [{ count, error: e1 }, { data, error: e2 }] = await Promise.all([
      s.from("bonsai_waterings").select("id", { count: "exact", head: true }),
      s.from("bonsai_waterings").select("id, created_at, blossom").order("created_at", { ascending: false }).limit(120),
    ]);
    if (e1 || e2) throw e1 ?? e2;
    return Response.json(
      { configured: true, count: count ?? data?.length ?? 0, items: data ?? [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[bonsai] read failed", err instanceof Error ? err.message : err);
    return Response.json({ configured: false, count: 0, items: [] });
  }
}

export async function POST(req: Request) {
  if (!isSupabaseConfigured) return Response.json({ error: "not_configured" }, { status: 503 });
  const rl = rateLimit(clientKey(req, "bonsai"), 3, 10 * 60_000);
  if (!rl.ok) {
    return Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
