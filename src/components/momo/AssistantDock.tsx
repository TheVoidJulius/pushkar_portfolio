"use client";

/**
 * Mikuro's resting spot in the corner (the flying 3D Mikuro lands here).
 * The chat feature was removed: she narrates and reacts, but takes no questions.
 */
export function AssistantDock() {
  return (
    <div
      data-momo-anchor="dock"
      aria-hidden
      className="pointer-events-none fixed right-2 bottom-2 z-40 size-[78px] sm:right-5 sm:bottom-5 sm:size-[104px]"
    />
  );
}
