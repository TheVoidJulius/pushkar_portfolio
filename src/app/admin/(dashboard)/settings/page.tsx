import { SettingsEditor } from "@/components/admin/editors/SettingsEditor";
import { getPortfolioContent } from "@/lib/content/queries";
import { getAdminSession } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { content } = await getPortfolioContent({ includeDrafts: true });
  const { user } = await getAdminSession();
  return <SettingsEditor initial={content.site} content={content} email={user?.email ?? ""} />;
}
