import { redirect } from "next/navigation";
import { Sidebar } from "@/components/admin/Sidebar";
import { NotAuthorized } from "@/components/admin/NotAuthorized";
import { SetupNotice } from "@/components/admin/SetupNotice";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getAdminSession } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Server-side guard for every dashboard page. The proxy only does an
 * optimistic redirect; this re-checks the session against Supabase and
 * confirms the user is the registered owner (public.admin_users).
 */
export default async function DashboardLayout({ children }: LayoutProps<"/admin">) {
  if (!isSupabaseConfigured) return <SetupNotice />;
  const { user, isAdmin } = await getAdminSession();
  if (!user) redirect("/admin/login");
  if (!isAdmin) return <NotAuthorized email={user.email ?? ""} />;

  return (
    <div className="lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <Sidebar email={user.email ?? ""} />
      <main className="min-w-0 px-4 pt-6 pb-10 sm:px-8 lg:px-12 lg:pt-10">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
