import { ArrowRight, Bot, Briefcase, CheckCircle2, CircleAlert, FolderKanban, Mail, Sparkles } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/admin/ui";
import { getPortfolioContent } from "@/lib/content/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const SECTIONS: { key: string; label: string; href: string }[] = [
  { key: "profile", label: "Hero", href: "/admin/hero" },
  { key: "projects", label: "Projects", href: "/admin/projects" },
  { key: "skills", label: "Skills", href: "/admin/skills" },
  { key: "experiences", label: "Experience", href: "/admin/experience" },
  { key: "about", label: "About", href: "/admin/about" },
  { key: "contact", label: "Contact", href: "/admin/contact" },
  { key: "assistant", label: "AI Assistant", href: "/admin/assistant" },
  { key: "site", label: "Settings", href: "/admin/settings" },
];

const latest = (rows: { updated_at?: string }[]) =>
  rows.reduce<string | undefined>((max, r) => (r.updated_at && (!max || r.updated_at > max) ? r.updated_at : max), undefined);

function ago(iso?: string) {
  if (!iso) return "—";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d < 30 ? `${d} day${d > 1 ? "s" : ""} ago` : new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default async function Overview() {
  const { content: c } = await getPortfolioContent({ includeDrafts: true });
  const supabase = await createSupabaseServerClient();
  const { count: unread } = await supabase.from("contact_messages").select("id", { count: "exact", head: true }).eq("is_read", false);

  const skills = c.skillCategories.flatMap((x) => x.skills);
  const published = c.projects.filter((p) => p.published).length;
  const updates: Record<string, string | undefined> = {
    profile: c.profile.updated_at,
    projects: latest(c.projects),
    skills: latest([...c.skillCategories, ...skills]),
    experiences: latest(c.experiences),
    about: c.about.updated_at,
    contact: c.contact.updated_at,
    assistant: c.assistant.updated_at,
    site: c.site.updated_at,
  };
  const lastKey = Object.entries(updates).sort((a, b) => (b[1] ?? "").localeCompare(a[1] ?? ""))[0];
  const lastSection = SECTIONS.find((s) => s.key === lastKey?.[0]);

  const claude = Boolean(process.env.ANTHROPIC_API_KEY);
  const eleven = Boolean(process.env.ELEVENLABS_API_KEY) && Boolean(c.assistant.voice_id || process.env.ELEVENLABS_VOICE_ID);

  const stats = [
    { label: "Projects", value: c.projects.length, sub: `${published} live · ${c.projects.length - published} draft`, icon: FolderKanban, href: "/admin/projects" },
    { label: "Skills", value: skills.length, sub: `in ${c.skillCategories.length} categories`, icon: Sparkles, href: "/admin/skills" },
    { label: "Experience", value: c.experiences.length, sub: `${c.experiences.filter((e) => e.is_current).length} current role`, icon: Briefcase, href: "/admin/experience" },
    { label: "New messages", value: unread ?? 0, sub: "from the contact form", icon: Mail, href: "/admin/contact#messages" },
  ];

  return (
    <>
      <PageHeader
        title={`Hi, ${c.profile.name.split(" ")[0]}!`}
        description="Here's how your portfolio is doing. Pick a section on the left to edit it — changes go live as soon as you save."
        actions={
          <a href="/" target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-[14px] font-medium text-bg">
            Open live site <ArrowRight className="size-4" />
          </a>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-3xl border border-line bg-surface p-5">
        <span className="relative flex size-3">
          <span className="absolute inset-0 animate-ping rounded-full bg-mint opacity-60" />
          <span className="relative size-3 rounded-full bg-mint" />
        </span>
        <p className="text-[15px]">
          <strong>Portfolio is live.</strong>{" "}
          <span className="text-ink-2">
            Last change: {lastSection ? `${lastSection.label}, ` : ""}
            {ago(lastKey?.[1])}.
          </span>
        </p>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, sub, icon: Icon, href }) => (
          <li key={label}>
            <Link href={href} className="group block rounded-3xl border border-line bg-surface p-5 transition hover:-translate-y-0.5 hover:shadow-soft">
              <div className="flex items-center justify-between">
                <span className="text-[14px] text-ink-2">{label}</span>
                <Icon className="size-[18px] text-ink-3 transition group-hover:text-accent" />
              </div>
              <p className="mt-3 font-display text-[42px] leading-none">{value}</p>
              <p className="mt-2 text-[13px] text-ink-3">{sub}</p>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-3xl border border-line bg-surface p-6">
          <h2 className="text-[17px] font-semibold">Last updated</h2>
          <ul className="mt-4 divide-y divide-line">
            {SECTIONS.map((s) => (
              <li key={s.key}>
                <Link href={s.href} className="flex items-center justify-between py-2.5 text-[14.5px] hover:text-accent-text">
                  {s.label}
                  <span className="text-[13px] text-ink-3">{ago(updates[s.key])}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-3xl border border-line bg-surface p-6">
          <h2 className="flex items-center gap-2 text-[17px] font-semibold">
            <Bot className="size-5" /> {c.assistant.name}&apos;s setup
          </h2>
          <ul className="mt-4 space-y-3 text-[14.5px]">
            <Status ok={c.site.show_assistant} label="Assistant shown on the site" fix="Turn on in Settings" />
            <Status
              ok={claude}
              label={claude ? "Smart answers (Claude AI) connected" : "Using built-in answers (no AI key)"}
              fix="Optional: add ANTHROPIC_API_KEY in Vercel for natural conversations"
              soft
            />
            <Status
              ok={eleven}
              label={eleven ? "Anime voice (ElevenLabs) connected" : "Using the browser's voice"}
              fix="Optional: add ELEVENLABS_API_KEY and pick a voice under AI Assistant"
              soft
            />
            <Status ok={c.assistant.voice_enabled} label="Voice replies enabled" fix="Turn on under AI Assistant" />
          </ul>
          <Link href="/admin/assistant" className="mt-5 inline-flex items-center gap-1 text-[14px] font-medium text-accent-text">
            Customise {c.assistant.name} <ArrowRight className="size-4" />
          </Link>
        </section>
      </div>
    </>
  );
}

function Status({ ok, label, fix, soft }: { ok: boolean; label: string; fix: string; soft?: boolean }) {
  return (
    <li className="flex gap-3">
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-[18px] shrink-0 text-mint" />
      ) : (
        <CircleAlert className={`mt-0.5 size-[18px] shrink-0 ${soft ? "text-amber" : "text-accent-text"}`} />
      )}
      <span>
        {label}
        {!ok && <span className="block text-[13px] text-ink-3">{fix}</span>}
      </span>
    </li>
  );
}
