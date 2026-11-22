import { conditionFromCode, fallbackWeather, HAZE_AQI, type Weather } from "@/components/site/footer/weather";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * New Delhi's current weather + air quality for the footer igloo, from
 * Open-Meteo (no key). Kept in memory for 15 minutes so Open-Meteo sees a
 * handful of requests per hour at most. Never fails: when Open-Meteo is
 * unreachable it serves the last good reading, or a calm default.
 */

const TTL_MS = 15 * 60_000;
const FORECAST =
  "https://api.open-meteo.com/v1/forecast?latitude=28.61&longitude=77.21&current=temperature_2m,weather_code,is_day,wind_speed_10m,precipitation&timezone=Asia%2FKolkata";
const AIR = "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=28.61&longitude=77.21&current=us_aqi,pm2_5";

let cache: { at: number; value: Weather } | null = null;
let inFlight: Promise<Weather> | null = null;

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

async function getJson(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(6_000), cache: "no-store" });
  if (!res.ok) throw new Error(`Open-Meteo responded ${res.status}`);
  return (await res.json()) as { current?: Record<string, unknown> };
}

async function load(): Promise<Weather> {
  const [forecast, air] = await Promise.allSettled([getJson(FORECAST), getJson(AIR)]);
  if (forecast.status === "rejected") throw forecast.reason;
  const c = forecast.value.current ?? {};
  const temp = num(c.temperature_2m);
  const code = num(c.weather_code);
  if (temp == null || code == null) throw new Error("Open-Meteo returned no current weather");
  const aqiRaw = air.status === "fulfilled" ? num(air.value.current?.us_aqi) : null;
  const aqi = aqiRaw == null ? null : Math.round(aqiRaw);
  return {
    temp: Math.round(temp * 10) / 10,
    code,
