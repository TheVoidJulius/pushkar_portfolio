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
  return h >= 6.25 && h < 17.75;
}

export function fallbackWeather(): Weather {
  return { temp: 18, code: 0, isDay: delhiIsDay(), wind: 6, aqi: null, condition: "clear", haze: false, live: false };
}

/**
 * Hidden test switch: `?weather=rain|fog|haze|heat|storm|clear` (plus
 * `night` / `day`, comma separated, e.g. `?weather=haze,night`).
 */
export function applyOverride(base: Weather, query: string | null): Weather {
  if (!query) return base;
  let w = { ...base };
  for (const token of query.toLowerCase().split(",").map((s) => s.trim())) {
    switch (token) {
      case "clear":
        w = { ...w, temp: 14, code: 0, wind: 6, aqi: 58, condition: "clear", haze: false };
        break;
      case "rain":
        w = { ...w, temp: 22, code: 63, wind: 16, aqi: 74, condition: "rain", haze: false };
        break;
      case "storm":
        w = { ...w, temp: 27, code: 95, wind: 42, aqi: 88, condition: "storm", haze: false };
        break;
      case "fog":
        w = { ...w, temp: 9, code: 45, wind: 3, aqi: 132, condition: "fog", haze: false };
        break;
      case "haze":
        w = { ...w, temp: 21, code: 3, wind: 4, aqi: 312, condition: "cloudy", haze: true };
        break;
      case "heat":
        w = { ...w, temp: 44, code: 0, wind: 9, aqi: 128, condition: "clear", haze: false };
        break;
      case "snow":
        w = { ...w, temp: -2, code: 73, wind: 10, aqi: 40, condition: "snow", haze: false };
        break;
      case "night":
        w = { ...w, isDay: false };
        break;
