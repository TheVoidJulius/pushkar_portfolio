import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/LoginForm";
import { SetupNotice } from "@/components/admin/SetupNotice";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getAdminSession } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  if (!isSupabaseConfigured) return <SetupNotice />;
  const { user, isAdmin } = await getAdminSession();
  if (user && isAdmin) redirect("/admin");
  const params = await searchParams;
  const next = typeof params.next === "string" && params.next.startsWith("/admin") ? params.next : "/admin";
  const error = typeof params.error === "string" ? params.error : undefined;
  return <LoginForm next={next} initialError={error} />;
}
