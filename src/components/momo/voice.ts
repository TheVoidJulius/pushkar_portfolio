"use client";

import { cleanForSpeech, type Mood } from "@/lib/assistant/protocol";
import type { AssistantSettings } from "@/lib/types";

export type VoiceStatus = "idle" | "loading" | "speaking" | "error";
type Listener = (status: VoiceStatus, info?: { engine: "elevenlabs" | "browser"; error?: string }) => void;

// Japanese female voices. Reading English text with one of these gives a
// natural Japanese accent. Neural ("Natural") voices first: they sound the
// most human and handle English words best.
const JAPANESE_FEMALE_VOICES = [
  /nanami.*natural/i, // Edge: "Microsoft Nanami Online (Natural)": warm, mature, expressive
  /aoi.*natural/i,
  /mayu.*natural/i,
  /shiori.*natural/i,
  /kyoko/i, // macOS / iOS
  /haruka/i, // Windows
  /ayumi/i, // Windows
  /o-ren/i, // macOS
  /google 日本語/i, // Chrome
];

// Warm, mature English female voices (fallback when no Japanese voice exists)
const ENGLISH_FEMALE_VOICES = [
  /sonia.*natural/i,
  /aria.*natural/i,
  /jenny.*natural/i,
  /ava.*(natural|multilingual)/i,
  /emma.*(natural|multilingual)/i,
  /google uk english female/i,
  /samantha/i,
  /\b(ava|allison|susan|karen|moira|tessa|serena)\b/i,
  /zira/i,
  /female/i,
];

// Per-mood delivery tweaks for the browser voice
const BROWSER_MOOD: Record<Mood, { pitch: number; rate: number }> = {
  happy: { pitch: 0.04, rate: 0.02 },
  excited: { pitch: 0.1, rate: 0.07 },
  curious: { pitch: 0.07, rate: -0.01 },
  gentle: { pitch: -0.06, rate: -0.07 },
  playful: { pitch: 0.08, rate: 0.03 },
  thinking: { pitch: -0.06, rate: -0.06 },
  confused: { pitch: 0.03, rate: -0.04 },
  surprised: { pitch: 0.12, rate: 0.05 },
};

/**
 * Plays Momo's speech. Prefers ElevenLabs via /api/tts (key stays on the
 * server); falls back to the browser's speechSynthesis automatically.
 * Exposes a live loudness value (levelRef) used for lip-sync.
 */
export class VoiceEngine {
  levelRef = { current: -1 };
  private listeners = new Set<Listener>();
  private audio: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private raf = 0;
  private remoteAvailable: boolean | null = null;
  private cache = new Map<string, string>();
  private token = 0;
  settings: AssistantSettings;

  constructor(settings: AssistantSettings) {
    this.settings = settings;
  }

  /** Updates settings (e.g. from the admin form) without recreating the engine. */
  configure(settings: AssistantSettings) {
    if (settings.voice_provider !== this.settings.voice_provider) this.remoteAvailable = null;
    this.settings = settings;
  }

  on(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit: Listener = (s, info) => this.listeners.forEach((l) => l(s, info));

  get browserSupported() {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  async checkRemote() {
    if (this.remoteAvailable !== null) return this.remoteAvailable;
    if (this.settings.voice_provider === "browser") return (this.remoteAvailable = false);
    try {
      const res = await fetch("/api/tts", { cache: "no-store" });
      this.remoteAvailable = res.ok && Boolean((await res.json()).elevenlabs);
    } catch {
      this.remoteAvailable = false;
    }
    return this.remoteAvailable;
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
    // Warm up speechSynthesis voices list (Chrome loads it lazily)
    if (this.browserSupported) window.speechSynthesis.getVoices();
  }

  stop() {
    this.token++;
    cancelAnimationFrame(this.raf);
    this.levelRef.current = -1;
    if (this.audio) {
      this.audio.pause();
      this.audio.src = "";
      this.audio = null;
    }
    if (this.browserSupported) window.speechSynthesis.cancel();
    this.emit("idle");
  }

  async speak(raw: string, mood: Mood = "happy") {
    const text = cleanForSpeech(raw);
    if (!text) return;
    this.stop();
    const token = ++this.token;
    this.emit("loading");

    if (await this.checkRemote()) {
      try {
        await this.playRemote(text, mood, token);
        return;
      } catch (err) {
        if (token !== this.token) return;
        console.warn("[voice] ElevenLabs unavailable, using browser voice", err);
        this.remoteAvailable = false; // don't keep retrying this session
      }
    }
    if (token !== this.token) return;
    this.playBrowser(text, mood, token);
  }

  private async playRemote(text: string, mood: Mood, token: number) {
    const cacheKey = `${mood}|${text}`;
    let url = this.cache.get(cacheKey);
    if (!url) {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, mood }),
      });
      if (!res.ok) throw new Error(`tts ${res.status}`);
      url = URL.createObjectURL(await res.blob());
      this.cache.set(cacheKey, url);
    }
    if (token !== this.token) return;

    const audio = new Audio(url);
    audio.crossOrigin = "anonymous";
    this.audio = audio;

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
      audio.onplaying = () => {
        this.emit("speaking", { engine: "elevenlabs" });
        this.trackLevel();
      };
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error("audio playback failed"));
      audio.play().catch(reject);
    });
    if (token === this.token) {
      cancelAnimationFrame(this.raf);
      this.levelRef.current = -1;
      this.emit("idle");
    }
  }

  private trackLevel() {
    const analyser = this.analyser;
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
      const rms = Math.sqrt(sum / buf.length);
      // ease toward target so the mouth doesn't jitter
      const target = Math.min(1, rms * 7);
      const prev = Math.max(0, this.levelRef.current);
      this.levelRef.current = prev + (target - prev) * 0.5;
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  /**
   * Chooses the browser voice. With the Japanese accent (default) a Japanese
   * female voice reads the English text; otherwise a warm English voice.
   */
  pickBrowserVoice(lang: string) {
    if (!this.browserSupported) return null;
    const voices = window.speechSynthesis.getVoices();
    const find = (pool: SpeechSynthesisVoice[], prefs: RegExp[]) => {
      for (const re of prefs) {
        const hit = pool.find((v) => re.test(v.name));
        if (hit) return hit;
      }
      return null;
    };
    if (this.settings.browser_accent !== "english") {
      const ja = voices.filter((v) => v.lang.toLowerCase().startsWith("ja"));
      const hit = find(ja, JAPANESE_FEMALE_VOICES);
      if (hit) return hit;
    }
    const base = lang.split("-")[0].toLowerCase();
    const sameLang = voices.filter((v) => v.lang.toLowerCase().startsWith(base));
    const pool = sameLang.length ? sameLang : voices;
    return find(pool, ENGLISH_FEMALE_VOICES) ?? pool.find((v) => v.lang.toLowerCase() === lang.toLowerCase()) ?? pool[0] ?? null;
  }

  private playBrowser(text: string, mood: Mood, token: number) {
    if (!this.browserSupported) {
      this.emit("error", { engine: "browser", error: "Speech isn't supported in this browser." });
      return;
    }
    const synth = window.speechSynthesis;
    const lang = this.settings.default_language || "en-US";
    const tweak = BROWSER_MOOD[mood];
    // Split into sentences: more natural pauses + avoids Chrome's 15s cutoff
    const parts = text.match(/[^.!?…]+[.!?…]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];

    synth.cancel();
    this.levelRef.current = -1;
    parts.forEach((part, i) => {
      const u = new SpeechSynthesisUtterance(part);
      const voice = this.pickBrowserVoice(lang);
      if (voice) u.voice = voice;
      u.lang = voice?.lang ?? lang;
      u.pitch = Math.max(0, Math.min(2, this.settings.browser_pitch + tweak.pitch));
      u.rate = Math.max(0.5, Math.min(1.6, this.settings.browser_rate + tweak.rate));
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
