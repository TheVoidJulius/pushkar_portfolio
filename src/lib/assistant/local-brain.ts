import type { PortfolioContent } from "../types";
import { formatMeta, type Mood, type SectionId } from "./protocol";

/**
 * Offline fallback used when no ANTHROPIC_API_KEY is configured (or the API
 * is unavailable). It answers ONLY from the portfolio content passed in, so it
 * can never invent facts — when it can't find an answer it says so.
 */

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}+#.\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

// Whole-word match; a trailing "*" marks a prefix (e.g. "employ*").
const has = (q: string, words: string[]) =>
  words.some((w) => new RegExp(`(^|\\s)${w.endsWith("*") ? w.slice(0, -1) : `${w}(?=\\s|$)`}`, "i").test(q));
const list = (items: string[], max = 4) => {
  const xs = items.slice(0, max);
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
};

type Answer = { mood: Mood; goto: SectionId | null; text: string };

export function localAnswer(question: string, c: PortfolioContent): string {
  const a = answer(question, c);
  return formatMeta({ mood: a.mood, goto: a.goto }) + a.text;
}

function answer(raw: string, c: PortfolioContent): Answer {
  const q = norm(raw);
  const owner = c.profile.name.split(" ")[0] || c.profile.name;
  const me = c.assistant.name;

  // --- specific entities first: projects, companies, skills -------------
  const project = c.projects.find((p) => q.includes(norm(p.title)));
  if (project) {
    const tech = project.technologies.length ? ` It's built with ${list(project.technologies)}.` : "";
    const outcome = project.highlight ? ` Best part? ${project.highlight}.` : "";
    return {
      mood: "excited",
      goto: "work",
      text: `${project.title} is one of my favourites! ${project.summary || project.description}${tech}${outcome}`,
    };
  }

  const job = c.experiences.find((e) => {
    const name = norm(e.company);
    const lead = name.split(" ")[0];
    return q.includes(name) || (lead.length > 3 && q.split(" ").includes(lead));
  });
  if (job) {
    const when = job.is_current ? "and still works there today" : `until ${job.end_date?.slice(0, 4)}`;
    return {
      mood: "gentle",
      goto: "experience",
      text: `${owner} joined ${job.company} as ${job.role} in ${job.start_date.slice(0, 4)}, ${when}. ${job.description}`,
    };
  }

  const allSkills = c.skillCategories.flatMap((cat) => cat.skills.map((s) => ({ ...s, cat: cat.name })));
  const skill = allSkills
    .filter((s) => {
      const n = norm(s.name);
      return n.length > 1 && (q.includes(n) || q.split(" ").includes(n.split(" ")[0]));
    })
    .sort((x, y) => y.name.length - x.name.length)[0];
  if (skill && has(q, ["know*", "use*", "skill*", "experience*", "work with", "can", "does", "do", "good", "familiar"])) {
    const level = { expert: "an expert in", proficient: "really comfortable with", familiar: "familiar with" }[skill.level];
    const used = c.projects.filter((p) => p.technologies.some((t) => norm(t).includes(norm(skill.name))));
    const extra = used.length ? ` You can see it in ${list(used.map((p) => p.title), 2)}.` : "";
    return { mood: "happy", goto: "skills", text: `Yes! ${owner} is ${level} ${skill.name}.${extra}` };
  }

  // --- intents ------------------------------------------------------------
  if (has(q, ["hi", "hello", "hey", "yo", "good morning", "good evening", "howdy"]) && q.split(" ").length <= 4) {
    return {
      mood: "excited",
      goto: null,
      text: `Hi hi! I'm ${me}. I can tell you about ${owner}'s projects, skills and experience, or take you anywhere on this page. What sounds fun?`,
    };
  }

  if (has(q, ["who are you", "what are you", "your name", "are you a*"]) || /\byou\b.*\b(cat|bot|ai)\b/.test(q)) {
    return {
      mood: "playful",
      goto: null,
      text: `I'm ${me}, ${owner}'s little portfolio companion! I know everything on this website, and I'm happy to show you around. I'm better at that than at catching laser dots.`,
    };
  }

  if (has(q, ["help", "what can you", "how does this", "options"])) {
    return {
      mood: "happy",
      goto: null,
      text: `I can walk you through ${owner}'s projects, explain the skills and experience, share contact details, or jump to any section. Try asking "what's the best project?"`,
    };
  }

  if (has(q, ["contact*", "email", "reach", "hire", "hiring", "get in touch", "message", "talk to"])) {
    const email = c.contact.email ? `You can email ${c.contact.email}` : `You can use the contact form`;
    const socials = c.contact.socials.length ? `, or find ${owner} on ${list(c.contact.socials.map((s) => s.label), 3)}` : "";
    return { mood: "happy", goto: "contact", text: `${email}${socials}. ${c.contact.availability_note}`.trim() };
  }

  if (has(q, ["linkedin", "github", "twitter", "social*", "dribbble", "instagram"])) {
    const found = c.contact.socials.filter((s) => q.includes(norm(s.platform)) || q.includes(norm(s.label)));
    const pick = found.length ? found : c.contact.socials;
    if (!pick.length) return unknown(owner, "social links");
    return { mood: "happy", goto: "contact", text: `Here you go: ${pick.map((s) => `${s.label} is ${s.url}`).join(", ")}.` };
  }

  if (has(q, ["experience", "job*", "career", "worked", "work at", "company", "companies", "employ*", "role", "current", "previous*"])) {
    if (!c.experiences.length) return unknown(owner, "work history");
    const [latest, ...rest] = c.experiences;
    const now = latest.is_current ? `Right now ${owner} is ${latest.role} at ${latest.company}.` : `Most recently, ${owner} was ${latest.role} at ${latest.company}.`;
    return {
      mood: "gentle",
      goto: "experience",
      text: `${now}${rest.length ? ` Before that: ${list(rest.map((e) => `${e.role} at ${e.company}`), 3)}.` : ""}`,
    };
  }

  if (has(q, ["project*", "work", "portfolio", "built", "build", "made", "best", "favorite", "favourite", "showcase", "case stud*"])) {
    if (!c.projects.length) return { mood: "gentle", goto: "work", text: `${owner} hasn't published any projects yet — check back soon!` };
    const featured = c.projects.filter((p) => p.featured);
    const top = (featured.length ? featured : c.projects)[0];
    const others = c.projects.filter((p) => p !== top).map((p) => p.title);
    return {
      mood: "excited",
      goto: "work",
      text: `Ooh, my pick is ${top.title}: ${top.summary}${others.length ? ` There's also ${list(others, 3)}.` : ""} Want to hear about any of them?`,
    };
  }

  if (has(q, ["skill*", "stack", "tech*", "language*", "framework*", "tool*", "good at", "know"])) {
    const cats = c.skillCategories.filter((x) => x.skills.length);
    if (!cats.length) return unknown(owner, "skills");
    const experts = allSkills.filter((s) => s.level === "expert").map((s) => s.name);
    return {
      mood: "happy",
      goto: "skills",
      text: `${owner}'s toolkit covers ${list(cats.map((x) => x.name.toLowerCase()), 5)}.${experts.length ? ` The strongest are ${list(experts, 4)}.` : ""}`,
    };
  }

  if (has(q, ["about", "who is", "background", "story", "bio", "tell me", "himself", "herself", "themself"])) {
    return {
      mood: "gentle",
      goto: "about",
      text: `${c.about.introduction || c.profile.description} ${c.about.headline}`.trim(),
    };
  }

  if (has(q, ["hobby", "hobbies", "interest*", "fun", "free time", "like to do"])) {
    if (!c.about.interests.length) return unknown(owner, "hobbies");
    return { mood: "playful", goto: "about", text: `Outside of work, ${owner} loves ${list(c.about.interests, 4).toLowerCase()}. Very good taste, if you ask me.` };
  }

  if (has(q, ["where", "location", "based", "live*", "country", "city"])) {
    const loc = c.profile.location || c.contact.location;
    if (!loc) return unknown(owner, "location");
    return { mood: "happy", goto: null, text: `${owner} is based in ${loc}.` };
  }

  if (has(q, ["available", "availability", "freelanc*", "open to"])) {
    const av = c.profile.availability || c.contact.availability_note;
    if (!av) return unknown(owner, "availability");
    return { mood: "happy", goto: "contact", text: `${av} The contact form is the quickest way to start a conversation.` };
  }

  // navigation: "go to / show me <section>"
  const nav: [string[], SectionId][] = [
    [["home", "top", "start"], "hero"],
    [["project*", "work"], "work"],
    [["skills"], "skills"],
    [["experience", "timeline"], "experience"],
    [["github", "commit*", "bonsai", "contribution*"], "github"],
    [["about"], "about"],
    [["contact", "footer"], "contact"],
  ];
  if (has(q, ["go to", "show", "take me", "scroll", "open", "navigate"])) {
    const hit = nav.find(([words]) => has(q, words));
    if (hit) return { mood: "excited", goto: hit[1], text: `On it! Follow me~` };
  }

  if (has(q, ["thank*", "cute", "love you", "awesome", "cool"])) {
    return { mood: "happy", goto: null, text: `Aww, thank you! That made my whiskers twitch. Anything else you'd like to see?` };
  }

  return unknown(owner);
}

function unknown(owner: string, topic?: string): Answer {
  return {
    mood: "confused",
    goto: null,
    text: topic
      ? `Hmm, I don't have any information about ${owner}'s ${topic} on this site, and I don't want to make things up. The contact form is the best way to ask directly!`
      : `Hmm, I'm not sure about that one, and I'd rather not guess. I can tell you about ${owner}'s projects, skills, experience or how to get in touch!`,
  };
}
