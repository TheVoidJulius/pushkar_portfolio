import { z } from "zod";

// Client-side validation mirroring the database CHECK constraints, so the
// owner sees friendly messages before the database rejects anything.

const url = z
  .string()
  .trim()
  .refine((v) => v === "" || /^https?:\/\/\S+\.\S+/.test(v), "Use a full link starting with https://");
const optionalUrl = url.transform((v) => (v === "" ? null : v));
const href = z
  .string()
  .trim()
  .min(1, "Required")
  .refine((v) => v.startsWith("#") || /^https?:\/\//.test(v) || v.startsWith("mailto:") || v.startsWith("/"), "Use #section, /path, mailto: or https://");

export const ProfileSchema = z.object({
  name: z.string().trim().min(1, "Your name is required").max(120),
  designation: z.string().trim().max(160),
  introduction: z.string().trim().max(400),
  description: z.string().trim().max(1200),
  location: z.string().trim().max(120),
  availability: z.string().trim().max(160),
  profile_image_url: z.string().nullable(),
  cta_primary_label: z.string().trim().min(1, "Required").max(40),
  cta_primary_href: href,
  cta_secondary_label: z.string().trim().min(1, "Required").max(40),
  cta_secondary_href: href,
  stats: z.array(z.object({ value: z.string().trim().min(1).max(12), label: z.string().trim().min(1).max(60) })).max(6),
});

export const ProjectSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1, "Give the project a title").max(120),
  summary: z.string().trim().min(1, "A one-line summary helps visitors").max(300),
  description: z.string().trim().max(4000),
  category: z.string().trim().max(60),
  year: z.string().trim().max(12),
  highlight: z.string().trim().max(160),
  image_url: z.string().nullable(),
  technologies: z.array(z.string().trim().min(1).max(40)).max(20),
  github_url: optionalUrl,
  demo_url: optionalUrl,
  featured: z.boolean(),
  published: z.boolean(),
  sort_order: z.number().int(),
});

export const ExperienceSchema = z
  .object({
    id: z.string().optional(),
    company: z.string().trim().min(1, "Company is required").max(120),
    role: z.string().trim().min(1, "Job title is required").max(120),
    location: z.string().trim().max(120),
    company_url: optionalUrl,
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a start date"),
    end_date: z.string().nullable(),
    is_current: z.boolean(),
    description: z.string().trim().max(2000),
    achievements: z.array(z.string().trim().min(1).max(300)).max(12),
    technologies: z.array(z.string().trim().min(1).max(40)).max(20),
    logo_url: z.string().nullable(),
    published: z.boolean(),
    sort_order: z.number().int(),
  })
  .refine((e) => e.is_current || Boolean(e.end_date), { path: ["end_date"], message: "Add an end date or tick “I work here now”" })
  .refine((e) => !e.end_date || e.is_current || e.end_date >= e.start_date, { path: ["end_date"], message: "End date must be after the start date" });

export const AboutSchema = z.object({
  headline: z.string().trim().max(200),
  introduction: z.string().trim().max(800),
  biography: z.string().trim().max(4000),
  background: z.string().trim().max(2000),
  interests: z.array(z.string().trim().min(1).max(60)).max(20),
  highlights: z.array(z.object({ title: z.string().trim().min(1, "Title required").max(60), description: z.string().trim().max(300) })).max(9),
  image_url: z.string().nullable(),
});

export const ContactSchema = z.object({
  email: z.union([z.literal(""), z.string().trim().email("That email doesn't look right")]),
  phone: z.string().trim().max(40),
  location: z.string().trim().max(120),
  availability_note: z.string().trim().max(300),
  form_enabled: z.boolean(),
  socials: z
    .array(
      z.object({
        platform: z.string().min(1),
        label: z.string().trim().min(1, "Label required").max(40),
        url: z.string().trim().refine((v) => /^(https?:\/\/|mailto:)\S+/.test(v), "Use a full link (https://…)"),
      }),
    )
    .max(12),
});

export const AssistantSchema = z.object({
  name: z.string().trim().min(1, "Give your assistant a name").max(40),
  greeting: z.string().trim().max(400),
  personality: z.string().trim().max(3000),
  default_language: z.string().trim().min(2).max(20),
  greeting_enabled: z.boolean(),
  tour_enabled: z.boolean(),
  voice_enabled: z.boolean(),
  voice_provider: z.enum(["auto", "elevenlabs", "browser"]),
  voice_id: z.string().trim().max(80),
  voice_model: z.string().trim().max(80),
  voice_stability: z.number().min(0).max(1),
  voice_style: z.number().min(0).max(1),
  voice_speed: z.number().min(0.7).max(1.2),
  browser_pitch: z.number().min(0).max(2),
  browser_rate: z.number().min(0.5).max(1.5),
  browser_accent: z.enum(["japanese", "english"]),
  suggested_questions: z.array(z.string().trim().min(1).max(120)).max(6),
});

export const SiteSchema = z.object({
  site_title: z.string().trim().min(1, "Required").max(120),
  meta_description: z.string().trim().max(300),
  footer_note: z.string().trim().max(300),
  show_assistant: z.boolean(),
});

/** Flattens zod errors into { "field.path": "message" }. */
export function fieldErrors(err: z.ZodError) {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
