"use client";

import { useSyncExternalStore } from "react";
import { currentFestival, type Festival } from "@/lib/festivals";

const noop = () => () => {};
let cached: Festival | null | undefined;
const snapshot = () => (cached === undefined ? (cached = currentFestival()) : cached);

/** Today's festival (IST) or the ?festival= override. Null while server-rendering. */
export function useFestival(): Festival | null {
  return useSyncExternalStore(noop, snapshot, () => null);
}
