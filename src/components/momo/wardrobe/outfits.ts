/**
 * Mikuro's wardrobe: which outfit she wears, shared by every Mikuro on the
 * page. The pick is broadcast as a window event (and across tabs through the
 * storage event) and remembered per viewer in localStorage.
 *
 * Kept free of three.js so the UI can import it without the 3D bundle.
 */

export const OUTFITS = [
  { id: "chrome", name: "Chrome", blurb: "The classic liquid-chrome coat.", swatch: ["#f4f6fa", "#9aa3b2"] },
  { id: "winter", name: "Winter", blurb: "Knit beanie and a striped scarf.", swatch: ["#d8343f", "#f3e6cf"] },
  { id: "hacker", name: "Hacker", blurb: "Matte black hoodie, neon-green glow.", swatch: ["#1b1d22", "#39ff88"] },
  { id: "royal", name: "Royal", blurb: "Polished gold and a velvet bow tie.", swatch: ["#f5c04a", "#b3122e"] },
] as const;

export type OutfitId = (typeof OUTFITS)[number]["id"];

export const DEFAULT_OUTFIT: OutfitId = "chrome";
const STORAGE_KEY = "mikuro-outfit";
const EVENT = "mikuro:outfit";

const isOutfit = (v: unknown): v is OutfitId => OUTFITS.some((o) => o.id === v);

let current: OutfitId | null = null;

/** The outfit this viewer picked (Chrome if none, or if storage is unavailable). */
export function readOutfit(): OutfitId {
  if (current) return current;
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    stored = null;
  }
  current = isOutfit(stored) ? stored : DEFAULT_OUTFIT;
  return current;
}

/** Dresses every Mikuro on the page and remembers the pick. */
export function wearOutfit(id: OutfitId) {
  if (!isOutfit(id) || id === readOutfit()) return;
  current = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // private mode / blocked storage: the outfit still applies for this visit
  }
  window.dispatchEvent(new CustomEvent<OutfitId>(EVENT, { detail: id }));
}

/** Calls back whenever the outfit changes (this tab or another). */
export function onOutfitChange(cb: (id: OutfitId) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onLocal = (e: Event) => {
    const id = (e as CustomEvent<unknown>).detail;
    if (isOutfit(id)) cb(id);
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    const id = isOutfit(e.newValue) ? e.newValue : DEFAULT_OUTFIT;
    if (id === current) return;
    current = id;
    cb(id);
  };
  window.addEventListener(EVENT, onLocal);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onLocal);
    window.removeEventListener("storage", onStorage);
  };
}
