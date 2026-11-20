import { redirect } from "next/navigation";
import { ResetPasswordForm } from "@/components/admin/ResetPasswordForm";
import { getAdminSession } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ResetPage() {
  const { user } = await getAdminSession();
  if (!user) redirect("/admin/login?error=link");
  return <ResetPasswordForm email={user.email ?? ""} />;
}
