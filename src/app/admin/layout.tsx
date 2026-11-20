import type { Metadata } from "next";
import { AdminToaster } from "@/components/admin/AdminToaster";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="min-h-dvh bg-bg">
      {children}
      <AdminToaster />
    </div>
  );
}
