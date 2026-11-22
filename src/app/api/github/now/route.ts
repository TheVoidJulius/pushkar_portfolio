import { getGitHubNow } from "@/lib/github-now";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Pushkar's latest public GitHub activity (cached ~2 min). */
export async function GET() {
  try {
    return Response.json(await getGitHubNow(), {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=120, stale-while-revalidate=600" },
    });
  } catch (err) {
    console.error("[github] now unavailable", err instanceof Error ? err.message : err);
    return Response.json({ at: null, repo: null, kind: null, message: null, url: null }, { status: 200 });
  }
}
