import { createClient } from "@supabase/supabase-js";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One city-level aggregate for today (UTC). Never an IP or a user agent. */
type City = { city: string; country: string; lat: number; lon: number; visits: number };
type Geo = Omit<City, "visits">;

const DEV = process.env.NODE_ENV !== "production";

/** Dev only: Vercel's geo headers don't exist locally, so ?geo=<city> fakes them. */
const DEV_CITIES: Geo[] = [
  { city: "Delhi", country: "IN", lat: 28.6, lon: 77.2 },
  { city: "Mumbai", country: "IN", lat: 19.1, lon: 72.9 },
  { city: "Bengaluru", country: "IN", lat: 13, lon: 77.6 },
  { city: "London", country: "GB", lat: 51.5, lon: -0.1 },
  { city: "Berlin", country: "DE", lat: 52.5, lon: 13.4 },
  { city: "New York", country: "US", lat: 40.7, lon: -74 },
  { city: "San Francisco", country: "US", lat: 37.8, lon: -122.4 },
  { city: "São Paulo", country: "BR", lat: -23.6, lon: -46.6 },
  { city: "Tokyo", country: "JP", lat: 35.7, lon: 139.7 },
  { city: "Sydney", country: "AU", lat: -33.9, lon: 151.2 },
  { city: "Lagos", country: "NG", lat: 6.5, lon: 3.4 },
];

const db = () => createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const today = () => new Date().toISOString().slice(0, 10);
const round1 = (n: number) => Math.round(n * 10) / 10;

const cleanCity = (raw: string | null) => {
  if (!raw) return null;
  let s = raw;
  try {
    s = decodeURIComponent(raw.replace(/\+/g, " "));
  } catch {
    /* not encoded after all */
  }
  s = s.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 80);
  return s || null;
};

const num = (raw: string | null, max: number) => {
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) && Math.abs(n) <= max ? round1(n) : null;
};

function geoFrom(req: Request): Geo | null {
  if (DEV) {
    const fake = new URL(req.url).searchParams.get("geo")?.toLowerCase();
    if (fake) return DEV_CITIES.find((c) => c.city.toLowerCase() === fake) ?? DEV_CITIES[0];
  }
  const h = req.headers;
  const city = cleanCity(h.get("x-vercel-ip-city"));
  const country = h.get("x-vercel-ip-country")?.trim().toUpperCase() ?? "";
  const lat = num(h.get("x-vercel-ip-latitude"), 90);
  const lon = num(h.get("x-vercel-ip-longitude"), 180);
  if (!city || !/^[A-Z]{2}$/.test(country) || lat === null || lon === null) return null;
  return { city, country, lat, lon };
}

const toCity = (r: Record<string, unknown>): City | null => {
  const lat = Number(r.lat);
  const lon = Number(r.lon);
  if (typeof r.city !== "string" || typeof r.country !== "string" || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { city: r.city, country: r.country, lat, lon, visits: Math.max(1, Number(r.visits) || 1) };
};

const json = (body: unknown, maxAge = 0) =>
  Response.json(body, {
    headers: { "Cache-Control": maxAge ? `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 5}` : "no-store" },
  });

/** Today's cities (UTC day). Short shared cache: the globe doesn't need to be live. */
export async function GET(req: Request) {
  const day = today();
  if (DEV && new URL(req.url).searchParams.get("geo") === "demo") {
    const cities = DEV_CITIES.map((c, i) => ({ ...c, visits: 1 + ((i * 7) % 5) }));
    return json({ configured: true, day, count: cities.length, cities });
  }
  if (!isSupabaseConfigured) return json({ configured: false, day, count: 0, cities: [] });
  try {
    const { data, error } = await db()
      .from("visitor_cities")
      .select("city, country, lat, lon, visits")
      .eq("day", day)
      .order("visits", { ascending: false })
      .limit(300);
    if (error) throw error;
    const cities = (data ?? []).map(toCity).filter((c): c is City => c !== null);
    return json({ configured: true, day, count: cities.length, cities }, 60);
  } catch (err) {
    console.error("[visitors] read failed", err instanceof Error ? err.message : err);
    return json({ configured: false, day, count: 0, cities: [] });
  }
}

/**
 * Counts this visitor's city once (the client calls it at most once a day).
 * Answers with that city so the globe can show "you" even without Supabase.
 */
export async function POST(req: Request) {
  const rl = rateLimit(clientKey(req, "visitors"), 4, 60 * 60_000);
  if (!rl.ok) {
    return Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  }
  const geo = geoFrom(req);
  if (!geo) return json({ recorded: false, day: today(), you: null });
  if (!isSupabaseConfigured) return json({ recorded: false, day: today(), you: geo });
  const { error } = await db().rpc("record_city_visit", { p_city: geo.city, p_country: geo.country, p_lat: geo.lat, p_lon: geo.lon });
  if (error) console.error("[visitors] record failed", error.message);
  return json({ recorded: !error, day: today(), you: geo });
}
