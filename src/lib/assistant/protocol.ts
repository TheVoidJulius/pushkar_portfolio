// Shared between the chat API and the browser.
// Every assistant reply begins with a meta tag:  [[mood=excited; goto=work]]
// The tag drives Momo's expression, her voice delivery and navigation,
// and is stripped before the text is shown or spoken.

export const MOODS = ["happy", "excited", "curious", "gentle", "playful", "thinking", "confused", "surprised"] as const;
export type Mood = (typeof MOODS)[number];

export const SECTIONS = ["hero", "work", "skills", "experience", "about", "contact"] as const;
export type SectionId = (typeof SECTIONS)[number];

export const SECTION_LABELS: Record<SectionId, string> = {
  hero: "Home",
  work: "Work",
  skills: "Skills",
  experience: "Experience",
  about: "About",
  contact: "Contact",
};

export type ReplyMeta = { mood: Mood; goto: SectionId | null };

const TAG_RE = /^\s*\[\[([^\]]*)\]\]\s*/;

export function formatMeta(meta: ReplyMeta) {
  return `[[mood=${meta.mood}; goto=${meta.goto ?? "none"}]] `;
}

/**
 * Parses a (possibly partial) streamed reply.
 * Returns `pending: true` while the tag might still be arriving.
 */
export function parseReply(raw: string): { meta: ReplyMeta | null; text: string; pending: boolean } {
  const match = raw.match(TAG_RE);
  if (match) {
    const fields = Object.fromEntries(
      match[1]
        .split(/[;,]/)
        .map((p) => p.split("=").map((s) => s.trim().toLowerCase()))
        .filter((kv) => kv.length === 2),
    );
    const mood = (MOODS as readonly string[]).includes(fields.mood) ? (fields.mood as Mood) : "happy";
    const goto = (SECTIONS as readonly string[]).includes(fields.goto) ? (fields.goto as SectionId) : null;
    return { meta: { mood, goto }, text: raw.slice(match[0].length), pending: false };
  }
  const trimmed = raw.trimStart();
  // Tag still streaming in
  if (trimmed.startsWith("[") && trimmed.length < 80 && !trimmed.includes("]]")) {
    return { meta: null, text: "", pending: true };
  }
  return { meta: null, text: raw, pending: false };
}

/** Removes any stray meta tags / markdown that shouldn't be read aloud. */
export function cleanForSpeech(text: string) {
  return text
    .replace(/\[\[[^\]]*\]\]/g, "")
    .replace(/\*\*?|__|`|#+\s/g, "")
    .replace(/https?:\/\/\S+/g, "the link")
    .replace(/\s+/g, " ")
    .trim();
}
