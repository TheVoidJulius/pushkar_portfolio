"use client";

import { z } from "zod";
import { getSupabaseBrowserClient } from "../supabase/client";
import type { PortfolioContent } from "../types";
import { AboutSchema, AssistantSchema, ContactSchema, ProfileSchema, SiteSchema } from "./schemas";

/**
 * JSON backup / restore of all portfolio content (not messages or images —
 * image URLs are kept, the files themselves stay in Supabase Storage).
 */

const uuid = z.string().uuid();
const BackupSchema = z.object({
  version: z.literal(1),
  content: z.object({
    site: SiteSchema,
    profile: ProfileSchema,
    about: AboutSchema,
    contact: ContactSchema,
    assistant: AssistantSchema,
    projects: z.array(z.object({ id: uuid, title: z.string().min(1) }).passthrough()),
    experiences: z.array(z.object({ id: uuid, company: z.string().min(1), role: z.string().min(1), start_date: z.string() }).passthrough()),
    skillCategories: z.array(
      z
        .object({
          id: uuid,
          name: z.string().min(1),
          skills: z.array(z.object({ id: uuid, name: z.string().min(1) }).passthrough()),
        })
        .passthrough(),
    ),
  }),
});

const PROJECT_COLS = ["id", "title", "summary", "description", "category", "year", "highlight", "image_url", "technologies", "github_url", "demo_url", "featured", "published", "sort_order"];
const EXP_COLS = ["id", "company", "role", "location", "company_url", "start_date", "end_date", "is_current", "description", "achievements", "technologies", "logo_url", "published", "sort_order"];
const CAT_COLS = ["id", "name", "description", "icon", "sort_order"];
const SKILL_COLS = ["id", "category_id", "name", "level", "sort_order"];

const pick = (o: Record<string, unknown>, cols: string[]) => Object.fromEntries(cols.filter((c) => c in o).map((c) => [c, o[c]]));

export function exportContent(content: PortfolioContent) {
  const payload = { version: 1, exported_at: new Date().toISOString(), content };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `portfolio-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function parseBackup(file: File) {
  let json: unknown;
  try {
    json = JSON.parse(await file.text());
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  const parsed = BackupSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`This doesn't look like a portfolio backup (${issue.path.join(".") || "root"}: ${issue.message}).`);
  }
  return parsed.data.content;
}

/** Replaces ALL portfolio content with the backup. */
export async function importContent(c: z.infer<typeof BackupSchema>["content"]) {
  const db = getSupabaseBrowserClient();
  const check = (r: { error: { message: string } | null }) => {
    if (r.error) throw new Error(r.error.message);
  };
  const NONE = "00000000-0000-0000-0000-000000000000";

  check(await db.from("site_settings").update(c.site).eq("id", 1));
  check(await db.from("profiles").update(c.profile).eq("id", 1));
  check(await db.from("about_content").update(c.about).eq("id", 1));
  check(await db.from("contact_details").update(c.contact).eq("id", 1));
  check(await db.from("assistant_settings").update(c.assistant).eq("id", 1));

  // Collections: clear, then insert the backup's rows (skills cascade with categories)
  check(await db.from("projects").delete().neq("id", NONE));
  check(await db.from("experiences").delete().neq("id", NONE));
  check(await db.from("skill_categories").delete().neq("id", NONE));

  if (c.projects.length) check(await db.from("projects").insert(c.projects.map((p) => pick(p, PROJECT_COLS))));
  if (c.experiences.length) check(await db.from("experiences").insert(c.experiences.map((e) => pick(e, EXP_COLS))));
  if (c.skillCategories.length) {
    check(await db.from("skill_categories").insert(c.skillCategories.map((x) => pick(x, CAT_COLS))));
    const skills = c.skillCategories.flatMap((x) => x.skills.map((s) => ({ ...pick(s, SKILL_COLS), category_id: x.id })));
    if (skills.length) check(await db.from("skills").insert(skills));
  }
}
