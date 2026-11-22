/**
 * Seasons & Indian festivals. Everything is evaluated on the IST calendar day
 * (Asia/Kolkata), whatever the visitor's own timezone.
 *
 * Lunar dates (2026-2028) were checked against Drik Panchang's New Delhi
 * calendars (drikpanchang.com): the Indian calendar pages for each year, the
 * Shardiya Navratri pages, and its Holi page for 2028. Observed dates:
 *   Holi (Dhulandi)   2026-03-04   2027-03-22   2028-03-11
 *   Raksha Bandhan    2026-08-28   2027-08-17   2028-08-05
 *   Navratri begins   2026-10-11   2027-09-30   2028-09-19
 *   Dussehra          2026-10-20   2027-10-09   2028-09-27
 *   Diwali (Lakshmi)  2026-11-08   2027-10-29   2028-10-17
 * Fixed-date ones (Republic Day 26 Jan, Independence Day 15 Aug, New Year,
 * December snow) need no lookup. Windows are a few days around the day.
 * Raksha Bandhan is listed for the quip only, it gets no scene.
 */

export type FestivalId =
  | "diwali"
  | "holi"
  | "navratri"
  | "rakhi"
  | "republic"
  | "independence"
  | "newyear"
  | "december";

export interface Festival {
  id: FestivalId;
  name: string;
  /** Three bloom colours the commit bonsai wears while this is on. */
  bloom: [string, string, string];
}

export const FESTIVALS: Record<FestivalId, Festival> = {
  diwali: { id: "diwali", name: "Diwali", bloom: ["#ffd166", "#ff9f1c", "#fff2c7"] },
  holi: { id: "holi", name: "Holi", bloom: ["#ff4fa3", "#35c2ff", "#ffe14d"] },
  navratri: { id: "navratri", name: "Navratri", bloom: ["#ff8a1f", "#e8344e", "#ffe28a"] },
  rakhi: { id: "rakhi", name: "Raksha Bandhan", bloom: ["#ff7a8a", "#ffc94d", "#fff0d6"] },
  republic: { id: "republic", name: "Republic Day", bloom: ["#ff9933", "#ffffff", "#2fa84f"] },
  independence: { id: "independence", name: "Independence Day", bloom: ["#ff9933", "#ffffff", "#2fa84f"] },
  newyear: { id: "newyear", name: "New Year", bloom: ["#ffe08a", "#9fd3ff", "#ffffff"] },
  december: { id: "december", name: "the December snow", bloom: ["#ffd1e1", "#ff9fbf", "#ffffff"] },
};

/** Inclusive IST windows [start, end] as YYYY-MM-DD, listed in priority order. */
const LUNAR: [FestivalId, string, string][] = [
  ["holi", "2026-03-03", "2026-03-05"],
  ["rakhi", "2026-08-27", "2026-08-29"],
  ["navratri", "2026-10-11", "2026-10-20"],
  ["diwali", "2026-11-05", "2026-11-11"],
  ["holi", "2027-03-21", "2027-03-23"],
  ["rakhi", "2027-08-16", "2027-08-18"],
  ["navratri", "2027-09-30", "2027-10-09"],
  ["diwali", "2027-10-26", "2027-11-01"],
  ["holi", "2028-03-10", "2028-03-12"],
  ["rakhi", "2028-08-04", "2028-08-06"],
  ["navratri", "2028-09-19", "2028-09-27"],
  ["diwali", "2028-10-14", "2028-10-20"],
];

/** Fixed yearly windows as MM-DD (a start after the end wraps the new year). */
const YEARLY: [FestivalId, string, string][] = [
  ["republic", "01-24", "01-26"],
  ["independence", "08-13", "08-15"],
  ["newyear", "12-30", "01-02"],
  ["december", "12-01", "12-29"],
];

/** The calendar day in India, as YYYY-MM-DD. */
export function istDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** The festival on at this moment (IST), or null. */
export function getActiveFestival(date: Date = new Date()): Festival | null {
  const day = istDay(date);
  for (const [id, a, b] of LUNAR) if (day >= a && day <= b) return FESTIVALS[id];
  const md = day.slice(5);
  for (const [id, a, b] of YEARLY) {
    if (a <= b ? md >= a && md <= b : md >= a || md <= b) return FESTIVALS[id];
  }
  return null;
}

/** `?festival=diwali` forces a festival (testing); `?festival=off` forces none. */
export function festivalOverride(search: string): Festival | null | undefined {
  const v = new URLSearchParams(search).get("festival")?.toLowerCase();
  if (!v) return undefined;
  if (v === "off" || v === "none") return null;
  const alias: Record<string, FestivalId> = { christmas: "december", xmas: "december", raksha: "rakhi", dussehra: "navratri", "new-year": "newyear" };
  const id = (alias[v] ?? v) as FestivalId;
  return FESTIVALS[id] ?? undefined;
}

/** Client-side: the override if present, else today's festival. */
export function currentFestival(): Festival | null {
  if (typeof window === "undefined") return null;
  const forced = festivalOverride(window.location.search);
  return forced === undefined ? getActiveFestival() : forced;
}
