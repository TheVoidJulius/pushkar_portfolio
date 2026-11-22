import "server-only";

/**
 * GitHub contribution history for the activity section.
 *
 * Sources, in order:
 *  1. GITHUB_TOKEN set: GitHub's GraphQL contribution calendar, live.
 *  2. Otherwise: the `data/contributions.json` that the owner's profile
 *     repository (<user>/<user>) refreshes on a schedule. Public, so no key
 *     is needed and nothing secret is involved.
 *
 * Results are kept in memory for 15 minutes; /api/github adds CDN caching
 * on top, so GitHub sees a handful of requests per hour at most.
 */

export const GITHUB_USERNAME = process.env.GITHUB_USERNAME?.trim() || "TheVoidJulius";
const TTL_MS = 15 * 60_000;

export type GitHubActivity = {
  user: string;
  profileUrl: string;
  /** Daily counts, oldest first (YYYY-MM-DD). */
  contributions: { date: string; count: number }[];
  total: number;
  updatedAt: string;
  source: "graphql" | "profile-repo";
};

let cache: { at: number; value: GitHubActivity } | null = null;
let inFlight: Promise<GitHubActivity> | null = null;

const isDay = (d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);

async function fromGraphQL(token: string): Promise<GitHubActivity> {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "User-Agent": "portfolio-activity" },
    body: JSON.stringify({
      query: `query($login: String!) { user(login: $login) { contributionsCollection { contributionCalendar {
        totalContributions weeks { contributionDays { date contributionCount } } } } } }`,
      variables: { login: GITHUB_USERNAME },
    }),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`GitHub GraphQL responded ${res.status}`);
  const json = (await res.json()) as {
    data?: { user?: { contributionsCollection?: { contributionCalendar?: {
      totalContributions: number;
      weeks: { contributionDays: { date: string; contributionCount: number }[] }[];
    } } } };
  };
  const cal = json.data?.user?.contributionsCollection?.contributionCalendar;
  if (!cal) throw new Error("GitHub GraphQL returned no calendar");
  const contributions = cal.weeks
    .flatMap((w) => w.contributionDays)
    .filter((d) => isDay(d.date))
    .map((d) => ({ date: d.date, count: Math.max(0, Number(d.contributionCount) || 0) }));
  return {
    user: GITHUB_USERNAME,
    profileUrl: `https://github.com/${GITHUB_USERNAME}`,
    contributions,
    total: cal.totalContributions,
    updatedAt: new Date().toISOString(),
    source: "graphql",
  };
}

async function fromProfileRepo(): Promise<GitHubActivity> {
  const u = encodeURIComponent(GITHUB_USERNAME);
  const res = await fetch(`https://raw.githubusercontent.com/${u}/${u}/main/data/contributions.json`, {
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Profile data responded ${res.status}`);
  const json = (await res.json()) as {
    total_contributions?: number;
    updated_at_utc?: string;
    days?: { date?: string; contributionCount?: number }[];
  };
  const contributions = (json.days ?? [])
    .filter((d) => isDay(d.date))
    .map((d) => ({ date: d.date as string, count: Math.max(0, Number(d.contributionCount) || 0) }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!contributions.length) throw new Error("Profile data has no days");
  return {
    user: GITHUB_USERNAME,
    profileUrl: `https://github.com/${GITHUB_USERNAME}`,
    contributions,
    total: json.total_contributions ?? contributions.reduce((n, d) => n + d.count, 0),
    updatedAt: json.updated_at_utc ?? new Date().toISOString(),
    source: "profile-repo",
  };
}

async function load() {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) {
    try {
      return await fromGraphQL(token);
    } catch (err) {
      console.warn("[github] GraphQL failed, using profile data", err instanceof Error ? err.message : err);
    }
  }
  return fromProfileRepo();
}

export async function getGitHubActivity(): Promise<GitHubActivity> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  inFlight ??= load()
    .then((value) => {
      cache = { at: Date.now(), value };
      return value;
    })
    .finally(() => {
      inFlight = null;
    });
  try {
    return await inFlight;
  } catch (err) {
    if (cache) return cache.value; // GitHub hiccup: serve the last good copy
    throw err;
  }
}
