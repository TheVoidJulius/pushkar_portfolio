/**
 * New Delhi's weather, as the igloo scene understands it. Shared by the
 * /api/weather route (which builds it) and the footer (which shows it).
 */

export type WeatherCondition = "clear" | "cloudy" | "fog" | "rain" | "storm" | "snow";

export type Weather = {
  /** °C */
  temp: number;
  /** WMO weather code */
  code: number;
  isDay: boolean;
  /** km/h */
  wind: number;
  /** US AQI, null when unknown */
  aqi: number | null;
  condition: WeatherCondition;
  /** Smog: US AQI above 150 */
  haze: boolean;
  /** false when this is the fallback rather than a live reading */
  live: boolean;
};

export const HAZE_AQI = 150;
export const HOT_TEMP = 35;

/** WMO code → the handful of moods the scene can draw. */
export function conditionFromCode(code: number): WeatherCondition {
  if (code >= 95) return "storm";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if (code === 45 || code === 48) return "fog";
  if (code === 2 || code === 3) return "cloudy";
  return "clear";
}

/** Daytime in New Delhi by the clock, for when the API is unreachable. */
export function delhiIsDay(now = new Date()) {
  const h = (now.getUTCHours() + now.getUTCMinutes() / 60 + 5.5) % 24;
