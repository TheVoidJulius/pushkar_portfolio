import "server-only";
import demo from "../../../supabase/seed-content.json";
import { isSupabaseConfigured } from "../supabase/config";
import { createSupabaseServerClient } from "../supabase/server";
import type {
  ContentSource,
  Experience,
  PortfolioContent,
  Project,
  Skill,
  SkillCategory,
} from "../types";

const demoContent = demo as unknown as PortfolioContent;

/** Normalises numeric columns (Postgres numeric arrives as string). */
function normaliseAssistant(a: PortfolioContent["assistant"]): PortfolioContent["assistant"] {
  return {
    ...a,
    voice_stability: Number(a.voice_stability),
    voice_style: Number(a.voice_style),
    voice_speed: Number(a.voice_speed),
    browser_pitch: Number(a.browser_pitch),
    browser_rate: Number(a.browser_rate),
  };
}

/**
 * Loads all portfolio content from Supabase — the single source of truth
 * for the public site AND the AI assistant.
 *
 * Visitors get only published rows (enforced by RLS). When an admin is
 * signed in and `includeDrafts` is set (preview mode), RLS also returns
 * unpublished rows and we keep them.
 *
 * If Supabase isn't configured yet, the bundled placeholder content is used
 * so the site still renders during setup. Once Supabase IS configured, a
 * database error is thrown (and shown as an error page) rather than silently
 * replacing the owner's real content with placeholders.
 */
export async function getPortfolioContent(
  opts: { includeDrafts?: boolean } = {},
): Promise<{ content: PortfolioContent; source: ContentSource }> {
  if (!isSupabaseConfigured) return { content: demoContent, source: "demo" };

  {
    const supabase = await createSupabaseServerClient();
    const [site, profile, about, contact, assistant, projects, categories, skills, experiences] =
      await Promise.all([
        supabase.from("site_settings").select("*").eq("id", 1).single(),
        supabase.from("profiles").select("*").eq("id", 1).single(),
        supabase.from("about_content").select("*").eq("id", 1).single(),
        supabase.from("contact_details").select("*").eq("id", 1).single(),
        supabase.from("assistant_settings").select("*").eq("id", 1).single(),
        supabase.from("projects").select("*").order("sort_order").order("created_at"),
        supabase.from("skill_categories").select("*").order("sort_order"),
        supabase.from("skills").select("*").order("sort_order"),
        supabase.from("experiences").select("*").order("sort_order").order("start_date", { ascending: false }),
      ]);

    const firstError = [site, profile, about, contact, assistant, projects, categories, skills, experiences].find(
      (r) => r.error,
    )?.error;
    if (firstError) throw new Error(firstError.message);

    const allSkills = (skills.data ?? []) as Skill[];
    const includeDrafts = Boolean(opts.includeDrafts);

    return {
      source: "supabase",
      content: {
        site: site.data,
        profile: { ...profile.data, stats: profile.data.stats ?? [] },
        about: about.data,
        contact: contact.data,
        assistant: normaliseAssistant(assistant.data),
        projects: ((projects.data ?? []) as Project[]).filter((p) => includeDrafts || p.published),
        experiences: ((experiences.data ?? []) as Experience[]).filter((e) => includeDrafts || e.published),
        skillCategories: ((categories.data ?? []) as SkillCategory[]).map((c) => ({
          ...c,
          skills: allSkills.filter((s) => s.category_id === c.id),
        })),
      },
    };
  }
}

export { demoContent };
