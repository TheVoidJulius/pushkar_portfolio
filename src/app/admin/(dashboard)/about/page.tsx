import { AboutEditor } from "@/components/admin/editors/AboutEditor";
import { getPortfolioContent } from "@/lib/content/queries";

export const dynamic = "force-dynamic";

export default async function AboutPage() {
  const { content } = await getPortfolioContent({ includeDrafts: true });
  return <AboutEditor initial={content.about} />;
}
