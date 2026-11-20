import { ContactEditor } from "@/components/admin/editors/ContactEditor";
import { getPortfolioContent } from "@/lib/content/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ContactPage() {
  const { content } = await getPortfolioContent({ includeDrafts: true });
  const supabase = await createSupabaseServerClient();
  const { data: messages } = await supabase
    .from("contact_messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  return <ContactEditor initial={content.contact} messages={messages ?? []} />;
}
