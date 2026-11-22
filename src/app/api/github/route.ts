import { getGitHubActivity } from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Contribution history for the GitHub section (public data, cached). */
export async function GET() {
  try {
    const activity = await getGitHubActivity();
    return Response.json(activity, {
      headers: { "Cache-Control": "public, max-age=300, s-maxage=900, stale-while-revalidate=3600" },
    });
  } catch (err) {
    console.error("[github] activity unavailable", err instanceof Error ? err.message : err);
    return Response.json({ error: "GitHub activity is unavailable right now." }, { status: 502 });
  }
}
