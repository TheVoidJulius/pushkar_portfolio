"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useAssistant } from "../../momo/AssistantProvider";
import { MomoHead } from "../../momo/MomoHead";
import type { Expression } from "../../momo/three/MomoRenderer";
import { OUTFITS, wearOutfit, type OutfitId } from "../../momo/wardrobe/outfits";
import { useOutfit } from "../../momo/wardrobe/useOutfit";
import { WARDROBE_LINES } from "../social/lines";

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';
const subscribeNothing = () => () => {};

/**
 * Mikuro's wardrobe beside the igloo: a little closet that opens a changing
 * room with a live Mikuro and her outfits. The pick dresses every Mikuro on
 * the page and is remembered on this device.
 */
export function ChangingRoom({ name = "Mikuro", dim = false }: { name?: string; dim?: boolean }) {
  const [open, setOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    // Focus goes back to the closet the dialog came from
    requestAnimationFrame(() => openerRef.current?.focus());
  }, []);

  return (
    <>
      <button
        ref={openerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Open ${name}'s wardrobe`}
        className={`group absolute right-4 bottom-24 flex flex-col items-center gap-1 rounded-xl p-1.5 font-mono text-[10.5px] outline-none focus-visible:ring-2 focus-visible:ring-accent sm:right-8 sm:bottom-28 sm:text-[11.5px] ${
          dim ? "text-white/70 hover:text-white" : "text-[#20252d]/65 hover:text-[#20252d]"
        }`}
      >
        <Closet />
        <span aria-hidden>wardrobe</span>
      </button>
      <ChangingRoomDialog open={open} onClose={close} name={name} />
    </>
  );
}

/** A tiny snow-capped wooden wardrobe; the doors swing ajar on hover/focus. */
function Closet() {
  const door = "transition-transform duration-300 ease-out motion-reduce:transition-none";
  return (
    <svg viewBox="0 0 48 60" className="h-[52px] w-[42px] drop-shadow-[0_4px_6px_rgba(0,0,0,0.28)] sm:h-[62px] sm:w-[50px]" aria-hidden>
      <rect x="4" y="8" width="40" height="46" rx="3" fill="#6b4126" />
      <rect x="6.5" y="11" width="35" height="41" rx="1.5" fill="#2a1a10" />
      {/* clothes peeking out when the doors open */}
      <rect x="10" y="16" width="7" height="16" rx="2" fill="#d8343f" />
      <rect x="19" y="16" width="7" height="18" rx="2" fill="#1b1d22" stroke="#39ff88" strokeWidth="0.8" />
      <rect x="28" y="16" width="8" height="15" rx="2" fill="#f5c04a" />
      <line x1="8" y1="15" x2="40" y2="15" stroke="#c9b28f" strokeWidth="1" />
      <g className={`${door} origin-[6.5px_31px] group-hover:[transform:scaleX(0.55)] group-focus-visible:[transform:scaleX(0.55)]`}>
        <rect x="6.5" y="11" width="17.5" height="41" rx="1.5" fill="#8a5632" stroke="#5a341d" strokeWidth="0.8" />
        <rect x="9" y="14" width="12.5" height="16" rx="1" fill="none" stroke="#6b4126" strokeWidth="0.8" />
        <rect x="9" y="33" width="12.5" height="16" rx="1" fill="none" stroke="#6b4126" strokeWidth="0.8" />
        <circle cx="21.6" cy="32" r="1" fill="#f2d49b" />
      </g>
      <g className={`${door} origin-[41.5px_31px] group-hover:[transform:scaleX(0.55)] group-focus-visible:[transform:scaleX(0.55)]`}>
        <rect x="24" y="11" width="17.5" height="41" rx="1.5" fill="#8a5632" stroke="#5a341d" strokeWidth="0.8" />
        <rect x="26.5" y="14" width="12.5" height="16" rx="1" fill="none" stroke="#6b4126" strokeWidth="0.8" />
        <rect x="26.5" y="33" width="12.5" height="16" rx="1" fill="none" stroke="#6b4126" strokeWidth="0.8" />
        <circle cx="26.4" cy="32" r="1" fill="#f2d49b" />
      </g>
      {/* snow on the roof, little feet */}
      <path d="M2 9.5 C6 3, 14 6, 18 4.5 S30 3, 34 5 S44 4, 46 9.5 Z" fill="#f4f7fb" />
      <rect x="7" y="54" width="5" height="4" rx="1" fill="#5a341d" />
      <rect x="36" y="54" width="5" height="4" rx="1" fill="#5a341d" />
    </svg>
  );
}

function ChangingRoomDialog({ open, onClose, name }: { open: boolean; onClose: () => void; name: string }) {
  const mounted = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  const reduce = useReducedMotion();
  const outfit = useOutfit();
  const { showQuip } = useAssistant();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [expression, setExpression] = useState<Expression>("happy");
  const [said, setSaid] = useState<string | null>(null);
  const timer = useRef(0);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    // Start on the outfit she is wearing
    requestAnimationFrame(() => dialog?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const items = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const inside = dialogRef.current.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      clearTimeout(timer.current);
    };
  }, [open, onClose]);

  const pick = (id: OutfitId) => {
    if (id === outfit) return;
    wearOutfit(id);
    const line = WARDROBE_LINES[id];
    setSaid(line.text);
    showQuip({ id: `wardrobe-${id}`, ...line }, true);
    setExpression(id === "hacker" ? "smug" : "excited");
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setExpression("happy"), 1800);
  };

  if (!mounted) return null;
  const current = OUTFITS.find((o) => o.id === outfit) ?? OUTFITS[0];
  return createPortal(
    <AnimatePresence onExitComplete={() => setSaid(null)}>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 backdrop-blur-sm sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.2 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="changing-room-title"
            aria-describedby="changing-room-desc"
            initial={reduce ? { opacity: 0 } : { y: 40, opacity: 0, scale: 0.98 }}
            animate={reduce ? { opacity: 1 } : { y: 0, opacity: 1, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { y: 30, opacity: 0 }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 360, damping: 32 }}
            className="flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-line bg-bg-elevated text-ink shadow-lift sm:rounded-3xl"
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-7">
              <div>
                <h2 id="changing-room-title" className="text-[18px] font-semibold tracking-tight">
                  {name}&apos;s changing room
                </h2>
                <p id="changing-room-desc" className="text-[13px] text-ink-3">
                  Pick an outfit. Every {name} on the page wears it, and this device remembers.
                </p>
              </div>
              <button type="button" onClick={onClose} aria-label="Close the wardrobe" className="grid size-9 shrink-0 place-items-center rounded-full text-[20px] leading-none hover:bg-surface-2">
                <span aria-hidden>×</span>
              </button>
            </div>

            <div className="grid gap-5 overflow-y-auto px-5 py-5 sm:grid-cols-[220px_minmax(0,1fr)] sm:px-7">
              {/* The mirror: a live Mikuro wearing the current pick */}
              <div className="relative mx-auto flex w-full max-w-[240px] flex-col items-center">
                <div
                  className="relative aspect-square w-[180px] overflow-hidden rounded-[999px_999px_28px_28px] border-[6px] border-[#8a5632] sm:w-[210px]"
                  style={{ background: "radial-gradient(circle at 50% 38%, #fff6e6 0%, #e9dcc6 55%, #b99c78 100%)" }}
                >
                  <MomoHead expression={expression} label={`${name} wearing the ${current.name} outfit`} className="absolute inset-[6%]" />
                </div>
                <p className="mt-2 font-mono text-[12px] text-ink-2" aria-live="polite">
                  wearing: {current.name}
                </p>
                <AnimatePresence mode="wait">
                  {said && (
                    <motion.p
                      key={said}
                      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: reduce ? 0 : 0.25 }}
                      className="mikuro-bubble mt-2 text-center"
                      aria-live="polite"
                    >
                      {said}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              <div className="grid content-start gap-2.5 sm:grid-cols-2" role="group" aria-label="Outfits">
                {OUTFITS.map((o) => {
                  const on = o.id === outfit;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => pick(o.id)}
                      aria-pressed={on}
                      className={`flex items-center gap-3 rounded-2xl border p-3 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none ${
                        on ? "border-ink bg-surface-2" : "border-line hover:border-line-strong hover:bg-surface-2/60"
                      }`}
                    >
                      <span
                        aria-hidden
                        className="size-10 shrink-0 rounded-full shadow-[inset_0_-3px_6px_rgba(0,0,0,0.25),inset_0_3px_5px_rgba(255,255,255,0.5)]"
                        style={{ background: `radial-gradient(circle at 35% 30%, ${o.swatch[0]} 0 45%, ${o.swatch[1]} 100%)` }}
                      />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 text-[15px] font-medium">
                          {o.name}
                          {on && <span className="font-mono text-[11px] text-ink-3">· on</span>}
                        </span>
                        <span className="block text-[12.5px] leading-snug text-ink-3">{o.blurb}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
