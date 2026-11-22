import type { Metadata } from "next";
import { PublicSite } from "@/components/site/PublicSite";
import { getPortfolioContent } from "@/lib/content/queries";
import { withLiveStats } from "@/lib/live-stats";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getAdminSession } from "@/lib/supabase/server";

// Rendered per request so edits made in /admin appear immediately — no redeploy.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { content } = await getPortfolioContent();
  const { site, profile } = content;
  return {
    title: site.site_title || profile.name,
    description: site.meta_description || profile.introduction,
    openGraph: {
      title: site.site_title || profile.name,
      description: site.meta_description || profile.introduction,
      type: "website",
      images: profile.profile_image_url && !profile.profile_image_url.endsWith(".svg") ? [profile.profile_image_url] : undefined,
    },
  };
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const wantsPreview = params.preview === "1" && isSupabaseConfigured;
  const isAdmin = wantsPreview ? (await getAdminSession()).isAdmin : false;
  const { content: stored } = await getPortfolioContent({ includeDrafts: isAdmin });
  const content = await withLiveStats(stored);

  return (
    <PublicSite
      content={content}
      previewBanner={
        isAdmin ? (
          <div className="fixed inset-x-0 bottom-0 z-[45] flex justify-center p-2 sm:bottom-auto sm:top-20">
            <p className="rounded-full bg-amber px-4 py-1.5 text-[13px] font-medium text-black shadow-soft">
              Preview mode — showing drafts too ·{" "}
              <a href="/admin" className="underline">
                Back to dashboard
              </a>
            </p>
          </div>
        ) : null
      }
    />
  );
}
