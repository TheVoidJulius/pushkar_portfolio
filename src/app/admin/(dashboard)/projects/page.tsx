import { ProjectsEditor } from "@/components/admin/editors/ProjectsEditor";
import { getPortfolioContent } from "@/lib/content/queries";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const { content } = await getPortfolioContent({ includeDrafts: true });
  return <ProjectsEditor initial={content.projects} />;
}
