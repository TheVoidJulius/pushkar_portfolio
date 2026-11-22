import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  kind: z.number().int().min(0).max(3),
  x: z.number().finite().min(0).max(1),
  z: z.number().finite().min(0).max(1),
});

const COLS = "id, created_at, kind, x, z";

// Stateless anon client: RLS is the only gate (select + range-checked insert).
const db = () => createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

export async function GET() {
  if (!isSupabaseConfigured) return Response.json({ configured: false, count: 0, items: [] });
  try {
    const s = db();
    const [{ count, error: e1 }, { data, error: e2 }] = await Promise.all([
      s.from("snow_marks").select("id", { count: "exact", head: true }),
      s.from("snow_marks").select(COLS).order("created_at", { ascending: false }).limit(200),
    ]);
    if (e1 || e2) throw e1 ?? e2;
    return Response.json(
      { configured: true, count: count ?? data?.length ?? 0, items: data ?? [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[snow] read failed", err instanceof Error ? err.message : err);
    return Response.json({ configured: false, count: 0, items: [] });
  }
}

export async function POST(req: Request) {
  if (!isSupabaseConfigured) return Response.json({ error: "not_configured" }, { status: 503 });
  const rl = rateLimit(clientKey(req, "snow"), 4, 10 * 60_000);
  if (!rl.ok) {
    return Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  const { kind, x, z: zz } = parsed.data;
  const { data, error } = await db().from("snow_marks").insert({ kind, x, z: zz }).select(COLS).single();
  if (error || !data) {
    console.error("[snow] insert failed", error?.message);
    return Response.json({ error: "failed" }, { status: 502 });
  }
  return Response.json(data, { status: 201 });
}
