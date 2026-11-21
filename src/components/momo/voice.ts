"use client";

import { speechText, type Mood } from "@/lib/assistant/protocol";
import type { AssistantSettings } from "@/lib/types";

export type VoiceStatus = "idle" | "loading" | "speaking" | "error";
type Engine = "elevenlabs" | "browser";
type Listener = (status: VoiceStatus, info?: { engine: Engine; error?: string }) => void;

const AUDIO_CACHE = "mikuro-voice-v1";
const MAX_BLOBS = 24;

const VOICE_ERRORS: Record<string, string> = {
  not_configured: "Mikuro's voice isn't set up yet, so it's text only for now.",
  bad_key: "Mikuro's voice key was rejected, so it's text only for now.",
  out_of_credits: "Mikuro's voice is out of credits, so it's text only for now.",
  daily_budget: "Mikuro has used up today's voice budget. Text only until tomorrow.",
  rate_limited: "Mikuro needs a moment before speaking again.",
};
const DEFAULT_ERROR = "Mikuro's voice is unavailable right now, so it's text only.";

// Warm English voices, used only if the owner explicitly selects the browser provider
const BROWSER_VOICES = [/sonia.*natural/i, /aria.*natural/i, /jenny.*natural/i, /google uk english female/i, /samantha/i, /zira/i, /female/i];

/**
 * Plays Mikuro's speech through ElevenLabs via /api/tts (the key stays on the
 * server). There is deliberately no automatic fallback to a browser voice: if
 * the real voice can't play, Mikuro goes text-only and says so. The browser
 * voice only runs when the owner picks it in the admin.
 *
 * Audio is kept in memory and in the Cache API, so a repeat visit costs nothing.
 */
export class VoiceEngine {
  levelRef = { current: -1 };
  private listeners = new Set<Listener>();
  private audio: HTMLAudioElement | null = null;
  private finishPlayback: (() => void) | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private raf = 0;
  private remote: Promise<{ ok: boolean; key: string; voiceId: string }> | null = null;
  private blobs = new Map<string, string>();
  private token = 0;
  settings: AssistantSettings;

  constructor(settings: AssistantSettings) {
    this.settings = settings;
  }

  configure(settings: AssistantSettings) {
    if (settings.voice_provider !== this.settings.voice_provider) this.remote = null;
    this.settings = settings;
  }

  on(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit: Listener = (s, info) => this.listeners.forEach((l) => l(s, info));

  get usesBrowserVoice() {
    return this.settings.voice_provider === "browser";
  }
  private get browserSupported() {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  private checkRemote() {
    this.remote ??= fetch("/api/tts", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => ({ ok: Boolean(d?.elevenlabs), key: String(d?.voiceKey ?? ""), voiceId: String(d?.voiceId ?? "") }))
      .catch(() => {
        this.remote = null; // a network blip shouldn't disable the voice for the session
        return { ok: false, key: "", voiceId: "" };
      });
    return this.remote;
  }

  remoteStatus() {
    return this.checkRemote();
  }

  /** Whether this visitor can hear a voice at all. Costs no credits. */
  async available() {
    if (this.usesBrowserVoice) return this.browserSupported;
    return (await this.checkRemote()).ok;
  }

  /** Must be called from a user gesture once, so audio is allowed to play. */
  unlock() {
    if (!this.ctx && typeof AudioContext !== "undefined") {
      try {
        this.ctx = new AudioContext();
      } catch {
        /* ignore */
      }
    }
    void this.ctx?.resume();
  }

  get audioContext() {
    return this.ctx;
  }

  stop() {
    this.token++;
    cancelAnimationFrame(this.raf);
    this.levelRef.current = -1;
    if (this.audio) {
      this.audio.onerror = null;
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio = null;
    }
    this.finishPlayback?.();
    this.finishPlayback = null;
    if (this.browserSupported && this.usesBrowserVoice) window.speechSynthesis.cancel();
    this.emit("idle");
  }

  async speak(raw: string, mood: Mood = "happy", signature?: string) {
    const text = speechText(raw);
    if (!text) return;
    this.stop();
    const token = ++this.token;
    this.emit("loading");

    if (this.usesBrowserVoice) return this.playBrowser(text, token);

    const remote = await this.checkRemote();
    if (token !== this.token) return;
    if (!remote.ok) {
      this.emit("error", { engine: "elevenlabs", error: VOICE_ERRORS.not_configured });
      return;
    }
    try {
      const url = await this.loadSpeech(text, mood, signature, remote.key);
      if (token !== this.token) return;
      await this.play(url, token);
    } catch (err) {
      if (token !== this.token) return;
      console.warn("[voice] speech failed", err);
      const code = err instanceof Error ? err.message : "";
      this.emit("error", { engine: "elevenlabs", error: VOICE_ERRORS[code] ?? DEFAULT_ERROR });
    }
  }

  /** Plays a pre-generated line (costs no credits). */
  async playClip(url: string) {
    this.stop();
    const token = ++this.token;
    try {
      await this.play(url, token);
    } catch {
      if (token === this.token) this.emit("idle"); // the bubble still shows the line
    }
  }

  private async loadSpeech(text: string, mood: Mood, signature: string | undefined, voiceKey: string) {
    const id = `${voiceKey}|${mood}|${text}`;
    const known = this.blobs.get(id);
    if (known) return known;

    const cacheUrl = `/__mikuro-voice/${await sha256(id)}.mp3`;
    let cache: Cache | null = null;
    try {
      cache = await caches.open(AUDIO_CACHE);
      const hit = await cache.match(cacheUrl);
      if (hit) return this.keepBlob(id, await hit.blob());
    } catch {
      cache = null; // Cache API blocked (private mode, insecure origin)
    }

    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, mood, signature }),
    });
    if (!res.ok) {
      const code = (await res.json().catch(() => null))?.error;
      throw new Error(typeof code === "string" ? code : "provider_error");
    }
    const blob = await res.blob();
    try {
      await cache?.put(cacheUrl, new Response(blob, { headers: { "Content-Type": "audio/mpeg" } }));
    } catch {
      /* storage full: the in-memory copy still works */
    }
    return this.keepBlob(id, blob);
  }

  private keepBlob(id: string, blob: Blob) {
    const url = URL.createObjectURL(blob);
    this.blobs.set(id, url);
    if (this.blobs.size > MAX_BLOBS) {
      const [oldId, oldUrl] = this.blobs.entries().next().value as [string, string];
      this.blobs.delete(oldId);
      URL.revokeObjectURL(oldUrl);
    }
    return url;
  }

  private async play(url: string, token: number) {
    const audio = new Audio(url);
    this.audio = audio;
    this.analyser = null;
    if (this.ctx) {
      try {
        const source = this.ctx.createMediaElementSource(audio);
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 512;
        source.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);
      } catch {
        this.analyser = null;
      }
    }

    await new Promise<void>((resolve, reject) => {
      this.finishPlayback = resolve;
      audio.onplaying = () => {
        this.emit("speaking", { engine: "elevenlabs" });
        this.trackLevel();
      };
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error("playback_failed"));
      audio.play().catch(reject);
    });
    if (token === this.token) {
      cancelAnimationFrame(this.raf);
      this.levelRef.current = -1;
      this.finishPlayback = null;
      this.emit("idle");
    }
  }

  private trackLevel() {
    const analyser = this.analyser;
    cancelAnimationFrame(this.raf);
    if (!analyser) {
      this.levelRef.current = -1; // synthetic mouth movement
      return;
    }
    const buf = new Uint8Array(analyser.fftSize);
    const loop = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      const target = Math.min(1, Math.sqrt(sum / buf.length) * 7);
      const prev = Math.max(0, this.levelRef.current);
      // Opens fast, closes a little slower, like a real jaw
      this.levelRef.current = prev + (target - prev) * (target > prev ? 0.6 : 0.3);
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  /** Only reachable when the owner explicitly selects the browser voice. */
  private playBrowser(text: string, token: number) {
    if (!this.browserSupported) {
      this.emit("error", { engine: "browser", error: "Speech isn't supported in this browser." });
      return;
    }
    const synth = window.speechSynthesis;
    const lang = this.settings.default_language || "en-US";
    const voices = synth.getVoices().filter((v) => v.lang.toLowerCase().startsWith(lang.split("-")[0].toLowerCase()));
    const japanese = this.settings.browser_accent !== "english" ? synth.getVoices().find((v) => v.lang.toLowerCase().startsWith("ja")) : undefined;
    const voice = japanese ?? BROWSER_VOICES.map((re) => voices.find((v) => re.test(v.name))).find(Boolean) ?? voices[0] ?? null;
    const parts = text.match(/[^.!?…]+[.!?…]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];

    synth.cancel();
    this.levelRef.current = -1;
    parts.forEach((part, i) => {
      const u = new SpeechSynthesisUtterance(part);
      if (voice) u.voice = voice;
      u.lang = voice?.lang ?? lang;
      u.pitch = this.settings.browser_pitch;
      u.rate = this.settings.browser_rate;
      if (i === 0) u.onstart = () => token === this.token && this.emit("speaking", { engine: "browser" });
      if (i === parts.length - 1) u.onend = () => token === this.token && this.emit("idle");
      u.onerror = (e) => {
        if (token !== this.token || e.error === "interrupted" || e.error === "canceled") return;
        this.emit("error", { engine: "browser", error: e.error });
      };
      synth.speak(u);
    });
  }
}

async function sha256(s: string) {
  if (!crypto.subtle) return btoa(unescape(encodeURIComponent(s))).replace(/[^a-z0-9]/gi, "").slice(0, 64);
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
