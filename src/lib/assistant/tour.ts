import type { PortfolioContent } from "../types";
import type { Mood, SectionId } from "./protocol";

/** One thing Momo says, shown as karaoke text next to her. */
export type MomoLineSpec = { id: string; section: SectionId; mood: Mood; texts: string[] };

const list = (items: string[], max = 3) => {
  const xs = items.slice(0, max);
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
};

/** First thing Mikuro says when the chat opens. */
export const chatGreeting = (c: PortfolioContent) =>
  `Oh, a visitor with questions. Go on, ask me about ${c.profile.name.split(" ")[0] || c.profile.name}.`;

/**
 * Mikuro's narration for every section, generated from the live portfolio
 * content (so it never goes stale). Each section shows its line next to
 * Momo when the visitor scrolls there; the guided tour plays them in order.
 */
export function buildLines(c: PortfolioContent): Record<SectionId, MomoLineSpec> {
  const owner = c.profile.name.split(" ")[0] || c.profile.name;
  const me = c.assistant.name;
  const featured = c.projects.find((p) => p.featured) ?? c.projects[0];
  const skills = c.skillCategories.flatMap((x) => x.skills);
  const experts = skills.filter((s) => s.level === "expert").map((s) => s.name);
  const [now] = c.experiences;

  return {
    hero: {
      id: "hero",
      section: "hero",
      mood: "excited",
      texts: [
        // The old stock greeting doesn't suit the character; a custom one is kept
        !c.assistant.greeting || /little portfolio companion/i.test(c.assistant.greeting)
          ? `Oh good, an audience. I'm ${me}. I live here, you're just visiting.`
          : c.assistant.greeting,
        `The page keeps going, and I have opinions about all of it. Scroll.`,
      ],
    },
    work: {
      id: "work",
      section: "work",
      mood: "excited",
      texts: [
        c.projects.length
          ? `${owner} made all ${c.projects.length} of these. My favourite is ${featured.title}, but don't tell the others.`
          : `${owner}'s projects are on their way. I'm guarding the empty shelf.`,
      ],
    },
    skills: {
      id: "skills",
      section: "skills",
      mood: "curious",
      texts: [
        skills.length
          ? `The toolkit. ${skills.length} skills, sorted by craft.${experts.length ? ` The superpowers are ${list(experts)}.` : ""}`
          : `Skills are being polished. Like me.`,
      ],
    },
    experience: {
      id: "experience",
      section: "experience",
      mood: "gentle",
      texts: [
        now
          ? `Keep scrolling and the dial turns. ${now.is_current ? `Right now it points at ${now.company}.` : `It starts at ${now.company}.`}`
          : `The timeline is coming soon.`,
      ],
    },
    github: {
      id: "github",
      section: "github",
      mood: "curious",
      texts: [`${owner}'s commits, grown into a bonsai. Bare twigs are the lazy weeks. I counted.`],
    },
    about: {
      id: "about",
      section: "about",
      mood: "playful",
      texts: [`A little about ${owner}. ${c.about.headline || "Worth getting to know, I promise."}`],
    },
    contact: {
      id: "contact",
      section: "contact",
      mood: "happy",
      texts: [`That's the whole tour! Say hello to ${owner} below, or tap me and ask me anything.`],
    },
  };
}
