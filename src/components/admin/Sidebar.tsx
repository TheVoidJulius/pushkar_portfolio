"use client";
/* eslint-disable @next/next/no-img-element -- tiny static avatar */

import {
  Bot,
  Briefcase,
  ExternalLink,
  FolderKanban,
  Home,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Settings,
  Sparkles,
  User,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/lib/admin/api";
import { ThemeToggle } from "../site/ThemeToggle";

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/hero", label: "Hero", icon: Home },
  { href: "/admin/projects", label: "Projects", icon: FolderKanban },
  { href: "/admin/skills", label: "Skills", icon: Sparkles },
  { href: "/admin/experience", label: "Experience", icon: Briefcase },
  { href: "/admin/about", label: "About", icon: User },
  { href: "/admin/contact", label: "Contact", icon: Mail },
  { href: "/admin/assistant", label: "AI Assistant", icon: Bot },
  { href: "/admin/settings", label: "Settings", icon: Settings },
] as const;

export function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));

  const nav = (
    <nav aria-label="Dashboard" className="flex h-full flex-col">
      <Link href="/admin" className="mb-6 flex items-center gap-2 px-2">
        <img src="/momo-avatar.png" alt="" className="size-11 object-contain" />
        <span>
          <span className="block text-[15px] leading-tight font-semibold">Portfolio</span>
          <span className="block text-[12px] text-ink-3">Dashboard</span>
        </span>
      </Link>
      <ul className="space-y-0.5">
        {NAV.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              onClick={() => setOpen(false)}
              aria-current={isActive(href) ? "page" : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14.5px] transition ${
                isActive(href) ? "bg-ink font-medium text-bg" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
              }`}
            >
              <Icon className="size-[18px]" aria-hidden />
              {label}
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-auto space-y-2 pt-6">
        <a
          href="/?preview=1"
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5 text-[14px] text-ink-2 hover:bg-surface-2 hover:text-ink"
        >
          Preview site (with drafts) <ExternalLink className="size-3.5" />
        </a>
        <div className="flex items-center gap-2 rounded-xl px-1 py-1">
          <ThemeToggle />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] text-ink-3" title={email}>
              {email}
            </p>
          </div>
          <button
            type="button"
            title="Sign out"
            aria-label="Sign out"
            onClick={async () => {
              await signOut();
              router.replace("/admin/login");
              router.refresh();
            }}
            className="grid size-10 place-items-center rounded-full border border-line text-ink-2 hover:text-ink"
          >
            <LogOut className="size-[18px]" />
          </button>
        </div>
      </div>
    </nav>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-bg/90 px-4 py-3 backdrop-blur lg:hidden">
        <Link href="/admin" className="flex items-center gap-2 font-semibold">
          <img src="/momo-avatar.png" alt="" className="size-8 object-contain" /> Dashboard
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          aria-expanded={open}
          className="grid size-10 place-items-center rounded-full border border-line"
        >
          <Menu className="size-5" />
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[280px] overflow-y-auto border-r border-line bg-bg-elevated p-4">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
              className="absolute top-4 right-4 grid size-9 place-items-center rounded-full hover:bg-surface-2"
            >
              <X className="size-5" />
            </button>
            {nav}
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh overflow-y-auto border-r border-line bg-bg-elevated/60 p-5 lg:block">{nav}</aside>
    </>
  );
}
