import "server-only";
import { GITHUB_USERNAME } from "./github";

/**
 * "What is Pushkar doing right now?": the newest public GitHub activity
 * (a push, a PR, a new repo). Public events API, cached for 2 minutes.
 */
export type GitHubNow = {
  at: string | null;
  repo: string | null;
  kind: "push" | "pr" | "create" | "other" | null;
  message: string | null;
  url: string | null;
};

const TTL_MS = 2 * 60_000;
let cache: { at: number; value: GitHubNow } | null = null;

const KINDS: Record<string, GitHubNow["kind"]> = { PushEvent: "push", PullRequestEvent: "pr", CreateEvent: "create" };

type Event = {
  type: string;
  created_at: string;
  repo: { name: string };
  payload?: { commits?: { message?: string }[]; pull_request?: { title?: string; html_url?: string }; ref_type?: string };
};

export async function getGitHubNow(): Promise<GitHubNow> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const token = process.env.GITHUB_TOKEN?.trim();
  const res = await fetch(`https://api.github.com/users/${GITHUB_USERNAME}/events/public?per_page=30`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "portfolio-now",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`GitHub events ${res.status}`);
  const events = (await res.json()) as Event[];
