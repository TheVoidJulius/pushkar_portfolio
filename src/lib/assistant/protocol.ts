// Shared between the chat API and the browser.
// Every assistant reply begins with a meta tag:  [[mood=excited; goto=work]]
// The tag drives Momo's expression, her voice delivery and navigation,
// and is stripped before the text is shown or spoken.

export const MOODS = ["happy", "excited", "curious", "gentle", "playful", "thinking", "confused", "surprised"] as const;
export type Mood = (typeof MOODS)[number];

export const SECTIONS = ["hero", "work", "skills", "experience", "github", "about", "contact"] as const;
export type SectionId = (typeof SECTIONS)[number];

export const SECTION_LABELS: Record<SectionId, string> = {
  hero: "Home",
  work: "Work",
  skills: "Skills",
  experience: "Experience",
  github: "GitHub",
  about: "About",
  contact: "Contact",
};

export type ReplyMeta = { mood: Mood; goto: SectionId | null };

const TAG_RE = /^\s*\[\[([^\]]*)\]\]\s*/;
// Trailer the chat API appends so the reply can be voiced. Also matches a
// partially streamed trailer, so it never flashes in the chat bubble.
const SIG_TAIL_RE = /\n\[{0,2}(?:s(?:i(?:g(?:=[a-f0-9]*\]{0,2})?)?)?)?$/;
const SIG_RE = /\n\[\[sig=([a-f0-9]{40})\]\]$/;

export const formatSignature = (signature: string) => `\n[[sig=${signature}]]`;
export const readSignature = (raw: string) => raw.match(SIG_RE)?.[1];

export function formatMeta(meta: ReplyMeta) {
  return `[[mood=${meta.mood}; goto=${meta.goto ?? "none"}]] `;
}

/**
 * Parses a (possibly partial) streamed reply.
 * Returns `pending: true` while the tag might still be arriving.
 */
export function parseReply(input: string): { meta: ReplyMeta | null; text: string; pending: boolean } {
  const raw = input.replace(SIG_TAIL_RE, "");
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

const MAX_SPEECH_CHARS = 420;

/** Exactly what gets voiced: clean text, capped at a sentence to protect credits. */
export function speechText(text: string) {
  const clean = cleanForSpeech(text);
  if (clean.length <= MAX_SPEECH_CHARS) return clean;
  const cut = clean.slice(0, MAX_SPEECH_CHARS);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return end > 80 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}
