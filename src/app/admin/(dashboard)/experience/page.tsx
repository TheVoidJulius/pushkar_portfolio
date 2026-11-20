import { ExperienceEditor } from "@/components/admin/editors/ExperienceEditor";
import { getPortfolioContent } from "@/lib/content/queries";

export const dynamic = "force-dynamic";

export default async function ExperiencePage() {
  const { content } = await getPortfolioContent({ includeDrafts: true });
  return <ExperienceEditor initial={content.experiences} />;
}
