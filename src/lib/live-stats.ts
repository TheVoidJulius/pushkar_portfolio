import "server-only";
import { unstable_cache } from "next/cache";
import { getGitHubActivity, GITHUB_USERNAME } from "@/lib/github";
import type { PortfolioContent } from "@/lib/types";

/**
 * Live GitHub + LeetCode numbers for the hero stats and the About highlight.
 *
 * Stored values stay the source of truth: every lookup is cached for a few
 * hours, has a short timeout, and on ANY failure the stored value is kept.
 * Stats are matched by label keywords, so no schema change is needed and the
 * admin can still edit the text freely (an unmatched label is left alone).
 */

const LEETCODE_USERNAME = process.env.LEETCODE_USERNAME?.trim() || "pushkar02panwar";
const REVALIDATE_S = 3 * 60 * 60;

type LeetCode = { total: number; easy: number; medium: number; hard: number };
type GitHub = { contributions: number | null; repos: number | null };

const getLeetCode = unstable_cache(
  async (): Promise<LeetCode> => {
    const res = await fetch("https://leetcode.com/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", Referer: "https://leetcode.com", "User-Agent": "portfolio-live-stats" },
      body: JSON.stringify({
        query: `query($u: String!) { matchedUser(username: $u) { submitStats { acSubmissionNum { difficulty count } } } }`,
        variables: { u: LEETCODE_USERNAME },
      }),
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`LeetCode responded ${res.status}`);
    const json = (await res.json()) as {
      data?: { matchedUser?: { submitStats?: { acSubmissionNum?: { difficulty: string; count: number }[] } } };
    };
    const rows = json.data?.matchedUser?.submitStats?.acSubmissionNum;
    if (!rows?.length) throw new Error("LeetCode returned no stats");
    const n = (d: string) => Math.max(0, Number(rows.find((r) => r.difficulty === d)?.count) || 0);
    const total = n("All");
    if (!total) throw new Error("LeetCode total is zero");
    return { total, easy: n("Easy"), medium: n("Medium"), hard: n("Hard") };
  },
  ["live-stats-leetcode"],
  { revalidate: REVALIDATE_S },
);

const getGitHub = unstable_cache(
  async (): Promise<GitHub> => {
    const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "portfolio-live-stats" };
    const token = process.env.GITHUB_TOKEN?.trim();
    if (token) headers.Authorization = `Bearer ${token}`;
    const [activity, user] = await Promise.allSettled([
      getGitHubActivity(),
      fetch(`https://api.github.com/users/${encodeURIComponent(GITHUB_USERNAME)}`, {
        headers,
        signal: AbortSignal.timeout(5_000),
        cache: "no-store",
      }).then((r) => {
        if (!r.ok) throw new Error(`GitHub responded ${r.status}`);
        return r.json() as Promise<{ public_repos?: number }>;
      }),
    ]);
    const contributions = activity.status === "fulfilled" && activity.value.total > 0 ? activity.value.total : null;
    const repos = user.status === "fulfilled" && Number(user.value.public_repos) > 0 ? Number(user.value.public_repos) : null;
    if (contributions === null && repos === null) throw new Error("GitHub stats unavailable");
    return { contributions, repos };
  },
  ["live-stats-github"],
  { revalidate: REVALIDATE_S },
);

const safe = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
  try {
    return await Promise.race([fn(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 8_000))]);
  } catch (err) {
    console.warn("[live-stats] using stored value:", err instanceof Error ? err.message : err);
    return null;
  }
};

const fmt = (n: number) => n.toLocaleString("en-US");

/** Returns content with live numbers substituted where available; never throws. */
export async function withLiveStats(content: PortfolioContent): Promise<PortfolioContent> {
  try {
    const stats = content.profile.stats;
    const wantGh = stats.some((s) => /github/i.test(s.label));
    const wantLc = /leetcode/i.test(JSON.stringify(stats)) || content.about.highlights.some((h) => /leetcode/i.test(h.title));
    const [gh, lc] = await Promise.all([wantGh ? safe(getGitHub) : null, wantLc ? safe(getLeetCode) : null]);
    if (!gh && !lc) return content;

    const nextStats = stats.map((s) => {
      const l = s.label.toLowerCase();
      if (gh && l.includes("github")) {
        if (gh.contributions !== null && /contribution/.test(l)) return { ...s, value: fmt(gh.contributions), live: true };
        if (gh.repos !== null && /repo/.test(l)) return { ...s, value: fmt(gh.repos), live: true };
      }
      if (lc && l.includes("leetcode") && /(solved|problem)/.test(l)) return { ...s, value: fmt(lc.total), live: true };
      return s;
    });

    const highlights = lc
      ? content.about.highlights.map((h) =>
          /leetcode/i.test(h.title) && /\d[\d,]*\s+solved/i.test(h.title)
            ? {
                title: h.title.replace(/\d[\d,]*(\s+solved)/i, `${fmt(lc.total)}$1`),
                description: h.description.replace(
                  /\d+ easy, \d+ medium and \d+ hard/i,
                  `${lc.easy} easy, ${lc.medium} medium and ${lc.hard} hard`,
                ),
              }
            : h,
        )
      : content.about.highlights;

    return {
      ...content,
      profile: { ...content.profile, stats: nextStats },
      about: { ...content.about, highlights },
    };
  } catch {
    return content;
  }
}
