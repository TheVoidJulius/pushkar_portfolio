"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { parseReply, SECTIONS, type Mood, type SectionId } from "@/lib/assistant/protocol";
import { buildLines, type MomoLineSpec } from "@/lib/assistant/tour";
import { scrollToSection } from "@/lib/scroll";
import type { AssistantSettings, PortfolioContent } from "@/lib/types";
import type { Expression } from "./three/MomoRenderer";
import { VoiceEngine, type VoiceStatus } from "./voice";

export type { Expression };
export type ChatMessage = { id: string; role: "user" | "assistant"; content: string; mood?: Mood; error?: boolean };

export const MOOD_TO_EXPRESSION: Record<Mood, Expression> = {
  happy: "happy",
  excited: "excited",
  curious: "curious",
  gentle: "talking",
  playful: "happy",
  thinking: "thinking",
  confused: "confused",
  surprised: "surprised",
};

const SLEEP_AFTER_MS = 45_000;
const INTRO_MS = 1500;

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

export type LineState = { index: number; progress: number; done: boolean };

type Ctx = {
  settings: AssistantSettings;
  ownerName: string;
  open: boolean;
  setOpen: (v: boolean) => void;
  messages: ChatMessage[];
  pending: boolean;
  expression: Expression;
  talking: boolean;
  levelRef: { current: number };
  voiceStatus: VoiceStatus;
  voiceEngine: "elevenlabs" | "browser" | null;
  voiceError: string | null;
  muted: boolean;
  toggleMute: () => void;
  stopSpeaking: () => void;
  replay: (m: ChatMessage) => void;
  send: (text: string) => Promise<void>;
  listening: boolean;
  interim: string;
  micSupported: boolean;
  toggleListening: () => void;
  poke: () => void;
  react: (e: Expression, ms?: number) => void;
  // Narration
  lines: Record<SectionId, MomoLineSpec>;
  lineState: Record<string, LineState>;
  activeLine: SectionId | null;
  focusLine: (id: SectionId) => void;
  intro: boolean;
  introPlaying: boolean;
  skipIntro: () => void;
  needsSound: boolean;
  enableSound: () => void;
  touring: boolean;
  startTour: () => void;
  stopTour: () => void;
  /** Where Momo should be: an anchor id. */
  anchor: string;
};

const AssistantContext = createContext<Ctx | null>(null);

export function useAssistant() {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error("useAssistant must be used inside <AssistantProvider>");
  return ctx;
}

const uid = () => Math.random().toString(36).slice(2, 10);
const readStore = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const writeStore = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* storage blocked — fine */
  }
};
const wordsOf = (t: string) => t.split(/\s+/).filter(Boolean).length;

export function AssistantProvider({ content, children }: { content: PortfolioContent; children: ReactNode }) {
  const settings = content.assistant;
  const ownerName = content.profile.name;
  const lines = useMemo(() => buildLines(content), [content]);
  const narrationEnabled = settings.tour_enabled !== false && content.site.show_assistant;

  const [open, setOpenState] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [baseExpression, setBaseExpression] = useState<Expression>("idle");
  const [flash, setFlash] = useState<Expression | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [voiceEngine, setVoiceEngine] = useState<"elevenlabs" | "browser" | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [muted, setMuted] = useState(() => !settings.voice_enabled || readStore("momo-muted") === "1");
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [micSupported] = useState(() => {
    if (typeof window === "undefined") return false;
    const W = window as unknown as Record<string, unknown>;
    return Boolean(W.SpeechRecognition || W.webkitSpeechRecognition);
  });
  const [sleeping, setSleeping] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  // Narration state
  const [intro, setIntro] = useState(narrationEnabled);
  const [activeLine, setActiveLine] = useState<SectionId | null>(narrationEnabled ? "hero" : null);
  const [lineState, setLineState] = useState<Record<string, LineState>>({});
  const [silentTalk, setSilentTalk] = useState(false);
  const [narrating, setNarrating] = useState(false);
  const [touring, setTouring] = useState(false);

  const voice = useMemo(() => new VoiceEngine(settings), [settings]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const moodTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const narr = useRef<{ id: SectionId | null; raf: number; timer: ReturnType<typeof setTimeout> | undefined; token: number }>({
    id: null,
    raf: 0,
    timer: undefined,
    token: 0,
  });
  const greeted = useRef(false);
  const live = useRef({ muted, messages, audioUnlocked, activeLine, touring, lineState });
  useEffect(() => {
    live.current = { muted, messages, audioUnlocked, activeLine, touring, lineState };
  }, [muted, messages, audioUnlocked, activeLine, touring, lineState]);

  const react = useCallback((e: Expression, ms = 1400) => {
    clearTimeout(flashTimer.current);
    setFlash(e);
    flashTimer.current = setTimeout(() => setFlash(null), ms);
  }, []);

  useEffect(() => {
    const off = voice.on((status, info) => {
      setVoiceStatus(status);
      if (info?.engine) setVoiceEngine(info.engine);
      setVoiceError(status === "error" ? (info?.error ?? "Voice unavailable") : null);
      if ((status === "idle" || status === "error") && !narr.current.id) {
        clearTimeout(moodTimer.current);
        moodTimer.current = setTimeout(() => setBaseExpression("idle"), 1600);
      }
    });
    return () => {
      off();
      voice.stop();
    };
  }, [voice]);

  // Browsers only allow sound after the visitor interacts with the page
  useEffect(() => {
    const unlock = () => {
      voice.unlock();
      setAudioUnlocked(true);
    };
    const events = ["pointerdown", "keydown", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, unlock, { once: true, passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, unlock));
  }, [voice]);

  // ---------------------------------------------------------------------
  // Narration: a karaoke line per section
  // ---------------------------------------------------------------------
  const setLine = useCallback((id: string, patch: Partial<LineState>) => {
    setLineState((st) => ({ ...st, [id]: { ...(st[id] ?? { index: 0, progress: 0, done: false }), ...patch } }));
  }, []);

  const stopNarration = useCallback(
    (finish: boolean) => {
      const n = narr.current;
      n.token++;
      cancelAnimationFrame(n.raf);
      clearTimeout(n.timer);
      if (n.id && finish) setLine(n.id, { progress: 1 });
      n.id = null;
      setNarrating(false);
      setSilentTalk(false);
      voice.stop();
    },
    [voice, setLine],
  );

  const advanceTour = useCallback((from: SectionId) => {
    const next = SECTIONS[SECTIONS.indexOf(from) + 1];
    if (!next) {
      setTouring(false);
      return;
    }
    scrollToSection(next);
  }, []);

  const playLine = useCallback(
    function play(id: SectionId, index: number) {
      const spec = lines[id];
      const text = spec?.texts[index];
      if (!text) return;
      stopNarration(false);
      const n = narr.current;
      const token = ++n.token;
      n.id = id;
      setNarrating(true);
      setLine(id, { index, progress: 0, done: false });
      setBaseExpression(MOOD_TO_EXPRESSION[spec.mood]);

      const { muted: m, audioUnlocked: u } = live.current;
      const withVoice = settings.voice_enabled && !m && u;
      const est = Math.max(1800, wordsOf(text) * (withVoice ? 360 : 300));
      let start = 0;

      const finish = () => {
        if (token !== n.token) return;
        cancelAnimationFrame(n.raf);
        clearTimeout(n.timer);
        setLine(id, { progress: 1 });
        setSilentTalk(false);
        const more = index + 1 < spec.texts.length;
        n.timer = setTimeout(
          () => {
            if (token !== n.token) return;
            if (more) play(id, index + 1);
            else {
              n.id = null;
              setNarrating(false);
              setLine(id, { done: true });
              setBaseExpression("idle");
              if (live.current.touring) setTimeout(() => advanceTour(id), 400);
            }
          },
          more ? (id === "hero" ? 3200 : 1800) : 900,
        );
      };

      const tick = (now: number) => {
        if (token !== n.token) return;
        if (!start) start = now;
        const p = Math.min(withVoice ? 0.97 : 1, (now - start) / est);
        setLine(id, { progress: p });
        if (p < 1) n.raf = requestAnimationFrame(tick);
        else finish();
      };

      if (withVoice) {
        // Words darken while she speaks; the line finishes when the audio ends
        const off = voice.on((status) => {
          if (token !== n.token) return off();
          if (status === "speaking" && !start) n.raf = requestAnimationFrame(tick);
          if (status === "idle" && start) {
            off();
            finish();
          }
          if (status === "error") {
            off();
            setSilentTalk(true);
            n.raf = requestAnimationFrame(tick); // fall back to timed karaoke
          }
        });
        void voice.speak(text, spec.mood);
        // Safety net if the speech engine never reports back
        n.timer = setTimeout(() => token === n.token && finish(), est * 1.8 + 4000);
      } else {
        setSilentTalk(true);
        n.raf = requestAnimationFrame(tick);
      }
    },
    [lines, settings.voice_enabled, voice, setLine, stopNarration, advanceTour],
  );

  const focusLine = useCallback((id: SectionId) => setActiveLine(id), []);

  // React to the focused line changing
  useEffect(() => {
    if (!narrationEnabled || intro || !activeLine || open) return;
    const st = live.current.lineState[activeLine];
    if (narr.current.id && narr.current.id !== activeLine) stopNarration(true);
    if (st?.done || narr.current.id === activeLine) return;
    playLine(activeLine, st?.index ?? 0);
  }, [activeLine, intro, open, narrationEnabled, playLine, stopNarration]);

  // Intro: Momo appears big, then shrinks into place beside the hero text
  useEffect(() => {
    if (!intro) return;
    const t = setTimeout(() => setIntro(false), INTRO_MS);
    return () => clearTimeout(t);
  }, [intro]);

  const skipIntro = useCallback(() => {
    setIntro(false);
    stopNarration(false);
    setLine("hero", { index: lines.hero.texts.length - 1, progress: 1, done: true });
    setBaseExpression("happy");
  }, [lines.hero.texts.length, setLine, stopNarration]);

  const enableSound = useCallback(() => {
    voice.unlock();
    setAudioUnlocked(true);
    live.current.audioUnlocked = true;
    setMuted(false);
    live.current.muted = false;
    writeStore("momo-muted", "0");
    const id = live.current.activeLine;
    if (id) playLine(id, live.current.lineState[id]?.index ?? 0); // replay the current line, now with sound
  }, [voice, playLine]);

  const startTour = useCallback(() => {
    setOpenState(false);
    stopNarration(false);
    setLineState({});
    setTouring(true);
    setActiveLine(null);
    scrollToSection("hero");
    setTimeout(() => setActiveLine("hero"), 900);
  }, [stopNarration]);

  const stopTour = useCallback(() => setTouring(false), []);

  // Visitor scrolling on their own ends the hands-free tour
  useEffect(() => {
    if (!touring) return;
    let armed = false;
    const arm = setTimeout(() => (armed = true), 1200);
    const onUser = () => armed && setTouring(false);
    window.addEventListener("wheel", onUser, { passive: true });
    window.addEventListener("touchmove", onUser, { passive: true });
    return () => {
      clearTimeout(arm);
      window.removeEventListener("wheel", onUser);
      window.removeEventListener("touchmove", onUser);
    };
  }, [touring]);

  // ---------------------------------------------------------------------
  // Sleep when idle
  // ---------------------------------------------------------------------
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setSleeping(true), SLEEP_AFTER_MS);
    };
    const wake = () => {
      setSleeping((was) => {
        if (was) react("surprised", 1100);
        return false;
      });
      arm();
    };
    const events = ["pointerdown", "keydown", "scroll", "pointermove"] as const;
    events.forEach((ev) => window.addEventListener(ev, wake, { passive: true }));
    arm();
    return () => {
      clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, wake));
    };
  }, [react]);

  // ---------------------------------------------------------------------
  // Chat
  // ---------------------------------------------------------------------
  const speak = useCallback(
    (text: string, mood: Mood) => {
      if (live.current.muted || !settings.voice_enabled) return;
      void voice.speak(text, mood);
    },
    [voice, settings.voice_enabled],
  );

  const setOpen = useCallback(
    (v: boolean) => {
      if (v) {
        stopNarration(true);
        setTouring(false);
      }
      setOpenState(v);
      if (v) {
        voice.unlock();
        setAudioUnlocked(true);
        if (!greeted.current && live.current.messages.length === 0) {
          greeted.current = true;
          const greeting = `What would you like to know about ${ownerName.split(" ")[0]}? Ask me anything.`;
          setMessages([{ id: uid(), role: "assistant", content: greeting, mood: "happy" }]);
          setBaseExpression("happy");
          speak(greeting, "happy");
        } else {
          react("happy");
        }
      } else {
        voice.stop();
        recognitionRef.current?.abort();
      }
    },
    [voice, ownerName, speak, react, stopNarration],
  );

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || pending) return;
      voice.unlock();
      voice.stop();
      const user: ChatMessage = { id: uid(), role: "user", content: text };
      const reply: ChatMessage = { id: uid(), role: "assistant", content: "" };
      const history = [...live.current.messages, user];
      setMessages([...history, reply]);
      setPending(true);
      setBaseExpression("thinking");
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history.filter((m) => !m.error).map(({ role, content }) => ({ role, content })) }),
        });
        if (!res.ok || !res.body) {
          const msg = (await res.json().catch(() => null))?.error ?? "I couldn't reach my brain just now.";
          throw new Error(msg);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let rawText = "";
        let mood: Mood = "happy";
        let navigated = false;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          rawText += decoder.decode(value, { stream: true });
          const parsed = parseReply(rawText);
          if (parsed.pending) continue;
          if (parsed.meta) {
            mood = parsed.meta.mood;
            setBaseExpression(MOOD_TO_EXPRESSION[mood]);
            if (parsed.meta.goto && !navigated) {
              navigated = true;
              scrollToSection(parsed.meta.goto);
            }
          }
          setMessages((ms) => ms.map((m) => (m.id === reply.id ? { ...m, content: parsed.text, mood } : m)));
        }
        const final = parseReply(rawText).text.trim() || "Hmm, I lost my train of thought. Could you ask again?";
        setMessages((ms) => ms.map((m) => (m.id === reply.id ? { ...m, content: final, mood } : m)));
        speak(final, mood);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Something went wrong.";
        setMessages((ms) => ms.map((m) => (m.id === reply.id ? { ...m, content: msg, mood: "confused", error: true } : m)));
        setBaseExpression("confused");
      } finally {
        setPending(false);
      }
    },
    [pending, voice, speak],
  );

  const toggleListening = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const W = window as unknown as Record<string, new () => SpeechRecognitionLike>;
    const Ctor = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!Ctor) return;
    voice.stop();
    const rec = new Ctor();
    rec.lang = settings.default_language || "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText = text;
      }
      setInterim(text);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setVoiceError("Microphone permission was blocked. You can still type!");
      else if (e.error !== "no-speech" && e.error !== "aborted") setVoiceError("I couldn't hear that. Try again or type instead.");
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
      if (finalText.trim()) void send(finalText);
      else setBaseExpression("idle");
    };
    recognitionRef.current = rec;
    setVoiceError(null);
    setListening(true);
    setBaseExpression("listening");
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  }, [listening, settings.default_language, send, voice]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      writeStore("momo-muted", next ? "1" : "0");
      live.current.muted = next;
      if (next) voice.stop();
      return next;
    });
  }, [voice]);

  const stopSpeaking = useCallback(() => voice.stop(), [voice]);
  const replay = useCallback(
    (m: ChatMessage) => {
      voice.unlock();
      void voice.speak(m.content, m.mood ?? "happy");
    },
    [voice],
  );
  const poke = useCallback(() => react(Math.random() < 0.5 ? "happy" : "surprised", 1200), [react]);

  const talking = voiceStatus === "speaking" || silentTalk;
  let expression: Expression = flash ?? baseExpression;
  if (listening) expression = "listening";
  else if (pending && !flash) expression = "thinking";
  else if (intro) expression = "surprised";
  else if (sleeping && !open && !talking && !flash && !narrating) expression = "sleeping";

  const introPlaying = narrationEnabled && (intro || (activeLine === "hero" && !lineState.hero?.done));
  const anchor = open ? "chat" : intro ? "intro" : activeLine ? `line-${activeLine}` : "dock";

  const value: Ctx = {
    settings,
    ownerName,
    open,
    setOpen,
    messages,
    pending,
    expression,
    talking,
    levelRef: voice.levelRef,
    voiceStatus,
    voiceEngine,
    voiceError,
    muted,
    toggleMute,
    stopSpeaking,
    replay,
    send,
    listening,
    interim,
    micSupported,
    toggleListening,
    poke,
    react,
    lines,
    lineState,
    activeLine,
    focusLine,
    intro,
    introPlaying,
    skipIntro,
    needsSound: settings.voice_enabled && (!audioUnlocked || muted),
    enableSound,
    touring,
    startTour,
    stopTour,
    anchor,
  };

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}
