"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Mic, Minus, Send, Square, Volume2, VolumeX, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useAssistant } from "./AssistantProvider";

const spring = { type: "spring", stiffness: 380, damping: 32 } as const;

export function AssistantDock() {
  const a = useAssistant();
  const reduce = useReducedMotion();
  const showLabel = !a.open && a.anchor === "dock";

  return (
    <>
      {/* Momo's resting spot (the flying 3D Momo lands here) */}
      <div
        data-momo-anchor="dock"
        aria-hidden
        className="pointer-events-none fixed right-3 bottom-3 z-40 size-[64px] sm:right-6 sm:bottom-6 sm:size-[76px]"
      />
      <AnimatePresence>
        {showLabel && (
          <motion.button
            key="ask"
            type="button"
            onClick={() => a.setOpen(true)}
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={spring}
            className="float-btn fixed right-[96px] bottom-7 z-40 hidden !flex-row items-center gap-2 px-3.5 text-[13px] sm:right-[112px] sm:bottom-[38px] md:!flex"
          >
            <span className="relative flex size-2">
              <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-60" />
              <span className="relative size-2 rounded-full bg-accent" />
            </span>
            Ask {a.settings.name}
          </motion.button>
        )}
      </AnimatePresence>
      <AnimatePresence>{a.open && <ChatPanel key="panel" />}</AnimatePresence>
    </>
  );
}

function StatusLine() {
  const a = useAssistant();
  let text = "Online · here to help";
  let tone = "bg-mint";
  if (a.listening) [text, tone] = ["Listening…", "bg-accent"];
  else if (a.pending) [text, tone] = ["Thinking…", "bg-lavender"];
  else if (a.voiceStatus === "loading") [text, tone] = ["Warming up her voice…", "bg-amber"];
  else if (a.talking) [text, tone] = [`Speaking${a.voiceEngine === "browser" ? " · browser voice" : ""}`, "bg-accent"];
  else if (a.muted) [text, tone] = ["Voice muted", "bg-ink-3"];
  return (
    <p className="flex items-center gap-1.5 text-[12px] text-ink-3" aria-live="polite">
      <span className={`size-1.5 rounded-full ${tone}`} />
      {text}
    </p>
  );
}

function ChatPanel() {
  const a = useAssistant();
  const reduce = useReducedMotion();
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && a.setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [a]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [a.messages, a.pending, reduce]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!draft.trim()) return;
    void a.send(draft);
    setDraft("");
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const showSuggestions = a.messages.length <= 1 && a.settings.suggested_questions.length > 0;
  const last = a.messages[a.messages.length - 1];

  return (
    <motion.div
      role="dialog"
      aria-modal="false"
      aria-label={`Chat with ${a.settings.name}`}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 40, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: 30, scale: 0.94 }}
      transition={spring}
      style={{ transformOrigin: "bottom right" }}
      className="fixed inset-x-2 bottom-2 z-50 flex h-[min(640px,82dvh)] flex-col overflow-hidden rounded-[28px] border border-line bg-bg-elevated shadow-lift sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[400px]"
    >
      {/* Header with the live cat */}
      <div className="relative flex items-center gap-3 border-b border-line bg-gradient-to-b from-surface-2 to-transparent px-4 pt-3 pb-3">
        {/* Momo flies into this slot while the chat is open */}
        <div data-momo-anchor="chat" aria-hidden className="-my-3 -ml-2 size-[92px] shrink-0" />
        <div className="min-w-0 flex-1 pb-1">
          <p className="font-display text-[22px] leading-none font-semibold tracking-tight">{a.settings.name}</p>
          <StatusLine />
        </div>
        <div className="flex items-center gap-1 pb-1">
          {a.settings.voice_enabled && (
            <IconButton
              label={a.muted ? "Unmute voice" : "Mute voice"}
              pressed={!a.muted}
              onClick={a.toggleMute}
            >
              {a.muted ? <VolumeX className="size-[18px]" /> : <Volume2 className="size-[18px]" />}
            </IconButton>
          )}
          <IconButton label="Minimise chat" onClick={() => a.setOpen(false)}>
            <Minus className="size-[18px]" />
          </IconButton>
          <IconButton
            label="Close chat"
            onClick={() => {
              a.stopSpeaking();
              a.setOpen(false);
            }}
          >
            <X className="size-[18px]" />
          </IconButton>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={listRef}
        className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4"
        aria-live="polite"
        aria-relevant="additions text"
        data-lenis-prevent
      >
        {a.messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <p className="max-w-[85%] rounded-3xl rounded-br-md bg-ink px-4 py-2.5 text-[14.5px] leading-snug text-bg">
                {m.content}
              </p>
            </div>
          ) : m.content ? (
            <div key={m.id} className="group flex items-end gap-2">
              <div
                className={`max-w-[85%] rounded-3xl rounded-bl-md border px-4 py-2.5 text-[14.5px] leading-relaxed ${
                  m.error ? "border-accent/30 bg-accent-soft text-ink" : "border-line bg-surface text-ink"
                }`}
              >
                {m.content}
              </div>
              {!m.error && a.settings.voice_enabled && (
                <button
                  type="button"
                  onClick={() => (a.talking && m === last ? a.stopSpeaking() : a.replay(m))}
                  aria-label={a.talking && m === last ? "Stop speaking" : "Play this message aloud"}
                  className="mb-1 grid size-7 shrink-0 place-items-center rounded-full text-ink-3 opacity-70 transition hover:bg-surface-2 hover:text-ink hover:opacity-100 focus-visible:opacity-100"
                >
                  {a.talking && m === last ? <Square className="size-3.5" /> : <Volume2 className="size-3.5" />}
                </button>
              )}
            </div>
          ) : (
            <div key={m.id} className="flex" aria-label={`${a.settings.name} is typing`}>
              <div className="flex gap-1 rounded-3xl rounded-bl-md border border-line bg-surface px-4 py-3.5">
                <span className="typing-dot size-1.5 rounded-full bg-ink-3" />
                <span className="typing-dot size-1.5 rounded-full bg-ink-3" />
                <span className="typing-dot size-1.5 rounded-full bg-ink-3" />
              </div>
            </div>
          ),
        )}

        {showSuggestions && (
          <div className="flex flex-wrap gap-2 pt-1">
            {a.settings.suggested_questions.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => void a.send(q)}
                className="rounded-full border border-line-strong bg-bg px-3 py-1.5 text-[13px] text-ink-2 transition hover:border-accent hover:text-accent-text"
              >
                {q}
              </button>
            ))}
          </div>
        )}
      </div>

      {(a.voiceError || a.listening) && (
        <div className="px-4 pb-1 text-[12.5px]">
          {a.listening ? (
            <p className="flex items-center gap-2 text-ink-2">
              <span className="flex h-3.5 items-end gap-[3px]" aria-hidden>
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className="eq-bar h-full w-[3px] rounded-full bg-accent" />
                ))}
              </span>
              {a.interim || "Listening… speak now"}
            </p>
          ) : (
            <p className="text-accent-text">{a.voiceError}</p>
          )}
        </div>
      )}

      {/* Composer */}
      <form onSubmit={submit} className="flex items-end gap-2 border-t border-line p-3">
        <label htmlFor="momo-input" className="sr-only">
          Message {a.settings.name}
        </label>
        <textarea
          id="momo-input"
          ref={inputRef}
          rows={1}
          value={draft}
          maxLength={1000}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={a.listening ? "Listening…" : `Ask ${a.settings.name} anything…`}
          className="max-h-28 min-h-[44px] flex-1 resize-none rounded-2xl border border-line bg-bg px-4 py-2.5 text-[14.5px] text-ink outline-none placeholder:text-ink-3 focus:border-accent"
        />
        {a.micSupported && (
          <button
            type="button"
            onClick={a.toggleListening}
            aria-label={a.listening ? "Stop listening" : "Speak to the assistant"}
            aria-pressed={a.listening}
            className={`relative grid size-11 shrink-0 place-items-center rounded-2xl border transition ${
              a.listening
                ? "border-accent bg-accent text-accent-ink"
                : "border-line bg-bg text-ink-2 hover:border-line-strong hover:text-ink"
            }`}
          >
            {a.listening && <span className="absolute inset-0 animate-ping rounded-2xl bg-accent/30" />}
            <Mic className="relative size-[18px]" />
          </button>
        )}
        <button
          type="submit"
          disabled={!draft.trim() || a.pending}
          aria-label="Send message"
          className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent text-accent-ink transition enabled:hover:brightness-105 disabled:opacity-40"
        >
          <Send className="size-[18px]" />
        </button>
      </form>
      <p className="px-4 pb-3 text-center text-[11px] text-ink-3">
        {a.settings.name} only knows what&apos;s on this site and can make mistakes.
      </p>
    </motion.div>
  );
}

function IconButton({
  label,
  onClick,
  children,
  pressed,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className="grid size-9 place-items-center rounded-full text-ink-2 transition hover:bg-surface-2 hover:text-ink"
    >
      {children}
    </button>
  );
}
