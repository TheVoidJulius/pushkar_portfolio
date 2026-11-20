import { HeroEditor } from "@/components/admin/editors/HeroEditor";
import { getPortfolioContent } from "@/lib/content/queries";

export const dynamic = "force-dynamic";

export default async function HeroPage() {
  const { content } = await getPortfolioContent({ includeDrafts: true });
  return <HeroEditor initial={content.profile} />;
}
