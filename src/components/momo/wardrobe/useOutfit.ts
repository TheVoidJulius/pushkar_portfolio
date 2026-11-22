"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_OUTFIT, onOutfitChange, readOutfit, type OutfitId } from "./outfits";

/** The outfit every Mikuro is wearing right now (Chrome during server rendering). */
export function useOutfit(): OutfitId {
  return useSyncExternalStore(onOutfitChange, readOutfit, () => DEFAULT_OUTFIT);
}
