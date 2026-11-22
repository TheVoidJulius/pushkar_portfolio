import type { PortfolioContent } from "../types";

const fmtDate = (d: string | null) => {
  if (!d) return "present";
  const date = new Date(`${d}T00:00:00Z`);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
};

/**
 * Turns the published portfolio content into a compact reference document.
 * Built fresh from the database on every request, so the assistant always
 * knows exactly what the website shows — nothing is hardcoded.
 */
export function buildKnowledge(c: PortfolioContent): string {
  const p = c.profile;
  const lines: string[] = [];

  lines.push("## Owner");
  lines.push(`Name: ${p.name}`);
  if (p.designation) lines.push(`Role: ${p.designation}`);
  if (p.introduction) lines.push(`Tagline: ${p.introduction}`);
  if (p.description) lines.push(`Summary: ${p.description}`);
  if (p.location) lines.push(`Location: ${p.location}`);
  if (p.availability) lines.push(`Availability: ${p.availability}`);
  if (p.stats?.length) lines.push(`Stats: ${p.stats.map((s) => `${s.value} ${s.label}`).join("; ")}`);

  lines.push("\n## Projects (section id: work)");
  if (!c.projects.length) lines.push("No projects are published yet.");
  for (const pr of c.projects) {
    const meta = [pr.category, pr.year].filter(Boolean).join(", ");
    lines.push(`- ${pr.title}${meta ? ` (${meta})` : ""}${pr.featured ? " [featured]" : ""}`);
    if (pr.summary) lines.push(`  Summary: ${pr.summary}`);
    if (pr.description) lines.push(`  Details: ${pr.description}`);
    if (pr.highlight) lines.push(`  Outcome: ${pr.highlight}`);
    if (pr.technologies.length) lines.push(`  Tech: ${pr.technologies.join(", ")}`);
    const links = [pr.demo_url && `live demo ${pr.demo_url}`, pr.github_url && `code ${pr.github_url}`].filter(Boolean);
    if (links.length) lines.push(`  Links: ${links.join("; ")}`);
  }

  lines.push("\n## Skills (section id: skills)");
  for (const cat of c.skillCategories) {
    if (!cat.skills.length) continue;
    const byLevel = (lvl: string) => cat.skills.filter((s) => s.level === lvl).map((s) => s.name);
    const parts = [
      byLevel("expert").length && `expert: ${byLevel("expert").join(", ")}`,
      byLevel("proficient").length && `proficient: ${byLevel("proficient").join(", ")}`,
      byLevel("familiar").length && `familiar: ${byLevel("familiar").join(", ")}`,
    ].filter(Boolean);
    lines.push(`- ${cat.name}: ${parts.join(" | ")}`);
  }

  lines.push("\n## Experience (section id: experience)");
  if (!c.experiences.length) lines.push("No experience entries are published yet.");
  for (const e of c.experiences) {
    lines.push(
      `- ${e.role} at ${e.company}${e.location ? `, ${e.location}` : ""} (${fmtDate(e.start_date)} – ${e.is_current ? "present" : fmtDate(e.end_date)})`,
    );
    if (e.description) lines.push(`  ${e.description}`);
    for (const a of e.achievements) lines.push(`  • ${a}`);
    if (e.technologies.length) lines.push(`  Tech: ${e.technologies.join(", ")}`);
  }

  lines.push("\n## GitHub activity (section id: github)");
  lines.push("A pixel bonsai grown from the owner's real GitHub contributions over the last 52 weeks: each branch tip is a week, leaves are commits, blossoms mark weeks with a commit every day. Exact numbers are shown in that section.");

  const a = c.about;
  lines.push("\n## About (section id: about)");
  if (a.headline) lines.push(`Headline: ${a.headline}`);
  if (a.introduction) lines.push(`Intro: ${a.introduction}`);
  if (a.biography) lines.push(`Biography: ${a.biography}`);
  if (a.background) lines.push(`Background: ${a.background}`);
  if (a.interests.length) lines.push(`Interests: ${a.interests.join(", ")}`);
  for (const h of a.highlights) lines.push(`Highlight — ${h.title}: ${h.description}`);

  const ct = c.contact;
  lines.push("\n## Contact (section id: contact)");
  if (ct.email) lines.push(`Email: ${ct.email}`);
  if (ct.phone) lines.push(`Phone: ${ct.phone}`);
  if (ct.location) lines.push(`Based in: ${ct.location}`);
  if (ct.availability_note) lines.push(`Note: ${ct.availability_note}`);
  for (const s of ct.socials) lines.push(`${s.label}: ${s.url}`);
  if (ct.form_enabled) lines.push("There is a contact form at the bottom of the page.");

  return lines.join("\n");
}
