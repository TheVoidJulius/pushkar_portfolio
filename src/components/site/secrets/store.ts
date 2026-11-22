/** Which easter eggs this visitor has found, remembered in localStorage (best effort). */
export const SECRETS = ["konami", "meow", "annoyed", "sudo", "console"] as const;
export type SecretId = (typeof SECRETS)[number];

const KEY = "pp:secrets";

export function readFound(): SecretId[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((s): s is SecretId => SECRETS.includes(s)) : [];
  } catch {
    return [];
  }
}

export function writeFound(found: SecretId[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(found));
  } catch {
    /* storage unavailable: the counter just lives for this visit */
  }
}

/** True when the keyboard focus is somewhere the visitor is typing. */
export function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}
