import type { Metadata } from "next";
import Link from "next/link";
import "./resume.css";
import { PrintButton } from "@/components/resume/PrintButton";
import { getPortfolioContent } from "@/lib/content/queries";

// Same cadence as the main page: edits in /admin show up immediately.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { profile, site } = (await getPortfolioContent()).content;
  const title = `${profile.name} — Résumé`;
  const description = `${profile.designation}. ${site.meta_description || profile.introduction}`.slice(0, 300);
  return {
    title,
    description,
    alternates: { canonical: "/resume" },
    openGraph: {
      title,
      description,
      type: "profile",
      url: "/resume",
      images: profile.profile_image_url && !profile.profile_image_url.endsWith(".svg") ? [profile.profile_image_url] : undefined,
    },
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmt(d: string) {
  const [y, m] = d.split("-");
  return m ? `${MONTHS[Number(m) - 1] ?? ""} ${y}`.trim() : y;
}

/** A link that also prints its URL as text. */
function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href}>
      {children}
      {!href.startsWith("mailto:") && <span className="rz-url"> ({href})</span>}
    </a>
  );
}

export default async function ResumePage() {
  const { content } = await getPortfolioContent();
  const { profile, about, contact, experiences, projects, skillCategories } = content;
  const exps = [...experiences].sort((a, b) => b.start_date.localeCompare(a.start_date));
  const projs = projects
    .filter((p) => p.published)
    .sort((a, b) => Number(b.featured) - Number(a.featured) || a.sort_order - b.sort_order);
  const cats = skillCategories.filter((c) => c.skills.length > 0);
  const summary = about.biography || about.introduction || profile.description;
  const photo = profile.profile_image_url;

  return (
    <main className="rz">
      <div className="rz-bar rz-noprint">
        <Link href="/" className="rz-btn">← Back to the fun version</Link>
        <PrintButton />
      </div>

      <header className="rz-head">
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="rz-photo" src={photo} alt={`Portrait of ${profile.name}`} width={84} height={84} />
        )}
        <div>
          <h1 className="rz-name">{profile.name}</h1>
          <p className="rz-role">{profile.designation}</p>
          <ul className="rz-contact">
            {contact.email && <li><ExtLink href={`mailto:${contact.email}`}>{contact.email}</ExtLink></li>}
            {contact.phone && <li>{contact.phone}</li>}
            {(contact.location || profile.location) && <li>{contact.location || profile.location}</li>}
            {contact.socials.map((s) => (
              <li key={s.url}><ExtLink href={s.url}>{s.label || s.platform}</ExtLink></li>
            ))}
          </ul>
        </div>
      </header>

      {summary && (
        <section className="rz-sec" aria-labelledby="rz-sum">
          <h2 className="rz-h2" id="rz-sum">Summary</h2>
          <p>{summary}</p>
        </section>
      )}

      {exps.length > 0 && (
        <section className="rz-sec" aria-labelledby="rz-exp">
          <h2 className="rz-h2" id="rz-exp">Experience</h2>
          {exps.map((e) => (
            <article className="rz-item" key={e.id}>
              <div className="rz-row">
                <h3 className="rz-h3">{e.role}</h3>
                <span className="rz-meta">{fmt(e.start_date)} – {e.is_current || !e.end_date ? "Present" : fmt(e.end_date)}</span>
              </div>
              <p className="rz-sub">
                {e.company_url ? <ExtLink href={e.company_url}>{e.company}</ExtLink> : e.company}
                {e.location ? ` · ${e.location}` : ""}
              </p>
              {e.description && <p>{e.description}</p>}
              {e.achievements.length > 0 && (
                <ul className="rz-list">{e.achievements.map((a) => <li key={a}>{a}</li>)}</ul>
              )}
              {e.technologies.length > 0 && <p className="rz-tags">{e.technologies.join(" · ")}</p>}
            </article>
          ))}
        </section>
      )}

      {projs.length > 0 && (
        <section className="rz-sec" aria-labelledby="rz-prj">
          <h2 className="rz-h2" id="rz-prj">Projects</h2>
          {projs.map((p) => (
            <article className="rz-item" key={p.id}>
              <div className="rz-row">
                <h3 className="rz-h3">{p.title}</h3>
                <span className="rz-meta">{[p.category, p.year].filter(Boolean).join(" · ")}</span>
              </div>
              <p>{p.summary || p.description}</p>
              {p.highlight && <p className="rz-sub rz-hl">{p.highlight}</p>}
              {p.technologies.length > 0 && <p className="rz-tags">{p.technologies.join(" · ")}</p>}
              {(p.github_url || p.demo_url) && (
                <p className="rz-tags">
                  {p.github_url && <ExtLink href={p.github_url}>Code</ExtLink>}
                  {p.github_url && p.demo_url && " · "}
                  {p.demo_url && <ExtLink href={p.demo_url}>Live demo</ExtLink>}
                </p>
              )}
            </article>
          ))}
        </section>
      )}

      {cats.length > 0 && (
        <section className="rz-sec" aria-labelledby="rz-skl">
          <h2 className="rz-h2" id="rz-skl">Skills</h2>
          {cats.map((c) => (
            <dl className="rz-skill rz-item" key={c.id}>
              <dt>{c.name}</dt>
              <dd>{[...c.skills].sort((a, b) => a.sort_order - b.sort_order).map((s) => s.name).join(", ")}</dd>
            </dl>
          ))}
        </section>
      )}

      <p className="rz-foot rz-noprint">Same content as the main site, in a plain format. Use Download PDF and choose Save as PDF.</p>
    </main>
  );
}
