import { SkillsEditor } from "@/components/admin/editors/SkillsEditor";
import { getPortfolioContent } from "@/lib/content/queries";

export const dynamic = "force-dynamic";

export default async function SkillsPage() {
  const { content } = await getPortfolioContent({ includeDrafts: true });
  return <SkillsEditor initial={content.skillCategories} />;
}
