"use client";

import { useSyncExternalStore } from "react";
import { TRACKS } from "@/lib/music/tracks";

/**
 * The music player's brain: one hidden YouTube player for the whole site,
 * plus a tiny store that the panel, the docked tab, the nav button and
 * Mikuro all read. Lives outside React so music keeps playing whatever the
 * UI is doing (panel open, tucked into the side, or closed).
 */

export type MusicView = "closed" | "open" | "docked";

export type MusicState = {
  view: MusicView;
  screen: "list" | "track";
  /** Index into TRACKS of the current song. */
  index: number;
  /** Display / playback order (Refresh shuffles it). */
  order: number[];
  playing: boolean;
  loading: boolean;
  time: number;
  duration: number;
  error: string | null;
  /** Something has been played this visit. */
  started: boolean;
};

const INITIAL: MusicState = {
  view: "closed",
  screen: "list",
  index: 0,
  order: TRACKS.map((_, i) => i),
  playing: false,
  loading: false,
  time: 0,
  duration: TRACKS[0]?.duration ?? 0,
  error: null,
  started: false,
};

let state = INITIAL;
const listeners = new Set<() => void>();
function set(patch: Partial<MusicState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

/** Read music state. Select a primitive (or the whole state object). */
export function useMusic<T>(select: (s: MusicState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => select(state),
    () => select(INITIAL),
  );
}
export const getMusic = () => state;

// ---------------------------------------------------------------------------
// YouTube IFrame API
// ---------------------------------------------------------------------------

type YTPlayer = {
  loadVideoById(id: string, startSeconds?: number): void;
  cueVideoById(id: string): void;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  setVolume(v: number): void;
  destroy(): void;
};
type YTNamespace = {
  Player: new (
    el: HTMLElement,
    opts: {
      host?: string;
      width?: number;
      height?: number;
      videoId?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (e: { target: YTPlayer }) => void;
        onStateChange?: (e: { data: number; target: YTPlayer }) => void;
        onError?: (e: { data: number }) => void;
      };
    },
  ) => YTPlayer;
};
type YTWindow = Window & { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void };

const STATE = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const;

const ERRORS: Record<number, string> = {
  2: "That video link looks broken.",
  5: "This song can't play in the browser right now.",
  100: "That video has been removed from YouTube.",
  101: "The owner doesn't allow this song to play outside YouTube.",
  150: "The owner doesn't allow this song to play outside YouTube.",
};

let apiPromise: Promise<YTNamespace> | null = null;
function loadApi() {
  apiPromise ??= new Promise<YTNamespace>((resolve, reject) => {
    const w = window as YTWindow;
    if (w.YT?.Player) return resolve(w.YT);
    const previous = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (w.YT) resolve(w.YT);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    s.onerror = () => {
      apiPromise = null;
      reject(new Error("YouTube didn't load"));
    };
    document.head.appendChild(s);
  });
  return apiPromise;
}

let player: YTPlayer | null = null;
let playerPromise: Promise<YTPlayer> | null = null;
let loadedId: string | null = null;
let wantPlay = false;
let ticker = 0;
let blockedTimer = 0;
let skipTimer = 0;

function startTicker() {
  stopTicker();
  ticker = window.setInterval(() => {
    if (!player) return;
    const duration = player.getDuration() || state.duration;
    set({ time: player.getCurrentTime() || 0, duration });
  }, 250);
}
function stopTicker() {
  window.clearInterval(ticker);
}

function onStateChange(e: { data: number; target: YTPlayer }) {
  switch (e.data) {
    case STATE.PLAYING:
      window.clearTimeout(blockedTimer);
      set({ playing: true, loading: false, started: true, error: null, duration: e.target.getDuration() || state.duration });
      startTicker();
      break;
    case STATE.PAUSED:
      stopTicker();
      set({ playing: false, loading: false });
      break;
    case STATE.BUFFERING:
      set({ loading: true });
      break;
    case STATE.ENDED:
      stopTicker();
      set({ playing: false, time: state.duration });
      next(); // keep the music going
      break;
    case STATE.CUED:
      set({ loading: false });
      break;
  }
}

function onError(e: { data: number }) {
  stopTicker();
  window.clearTimeout(blockedTimer);
  set({ playing: false, loading: false, error: ERRORS[e.data] ?? "This song couldn't play." });
  // Don't strand the visitor on a song that can't play: move on
  if (wantPlay) {
    window.clearTimeout(skipTimer);
    skipTimer = window.setTimeout(() => wantPlay && next(), 2200);
  }
}

/** Creates the hidden player once. Invisible, but kept in the viewport so browsers don't throttle it. */
function ensurePlayer() {
  if (player) return Promise.resolve(player);
  playerPromise ??= loadApi().then(
    (YT) =>
      new Promise<YTPlayer>((resolve) => {
        const wrap = document.createElement("div");
        wrap.setAttribute("aria-hidden", "true");
        wrap.dataset.musicEngine = "";
        Object.assign(wrap.style, {
          position: "fixed",
          left: "0",
          bottom: "0",
          width: "200px",
          height: "200px",
          opacity: "0",
          pointerEvents: "none",
          zIndex: "-1",
          overflow: "hidden",
        });
        const host = document.createElement("div");
        wrap.appendChild(host);
        document.body.appendChild(wrap);
        const first = TRACKS[state.index];
        loadedId = first.youtubeId;
        new YT.Player(host, {
          host: "https://www.youtube-nocookie.com", // privacy-enhanced mode
          width: 200,
          height: 200,
          videoId: first.youtubeId,
          playerVars: { controls: 0, disablekb: 1, playsinline: 1, rel: 0, iv_load_policy: 3, fs: 0, origin: window.location.origin },
          events: {
            onReady: (e) => {
              player = e.target;
              player.setVolume(100);
              resolve(player);
            },
            onStateChange,
            onError,
          },
        });
      }),
  );
  playerPromise.catch(() => {
    playerPromise = null;
    set({ loading: false, error: "YouTube couldn't be reached. Check the connection and try again." });
  });
  return playerPromise;
}

/** Starts the current track. Called straight from a click so the browser allows sound. */
function playCurrent() {
  const id = TRACKS[state.index].youtubeId;
  wantPlay = true;
  set({ loading: true, error: null });
  const go = (p: YTPlayer) => {
    if (loadedId !== id) {
      loadedId = id;
      p.loadVideoById(id);
    } else p.playVideo();
  };
  if (player) go(player);
  else void ensurePlayer().then((p) => wantPlay && go(p));
  // Some browsers (iOS Safari especially) refuse to start embedded audio
  window.clearTimeout(blockedTimer);
  blockedTimer = window.setTimeout(() => {
    if (!state.playing && wantPlay) {
      set({ loading: false, error: "Your browser held the music back. Press play again, or open it on YouTube." });
    }
  }, 6000);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function select(index: number) {
  window.clearTimeout(skipTimer);
  const same = index === state.index && state.started;
  set({
    index,
    screen: "track",
    ...(same ? {} : { time: 0, duration: TRACKS[index].duration }),
  });
  if (!same || !state.playing) playCurrent();
}

function toggle() {
  if (state.playing || (wantPlay && state.loading)) pause();
  else playCurrent();
}

function pause() {
  wantPlay = false;
  window.clearTimeout(blockedTimer);
  window.clearTimeout(skipTimer);
  player?.pauseVideo();
  stopTicker();
  set({ playing: false, loading: false });
}

function step(dir: 1 | -1) {
  const pos = state.order.indexOf(state.index);
  const n = state.order.length;
  return state.order[(pos + dir + n) % n];
}

function next() {
  window.clearTimeout(skipTimer);
  set({ index: step(1), time: 0, duration: TRACKS[step(1)].duration });
  playCurrent();
}

function prev() {
  // Like any player: early in a song goes back a track, later restarts it
  if (state.time > 3 && player) return seek(0);
  window.clearTimeout(skipTimer);
  set({ index: step(-1), time: 0, duration: TRACKS[step(-1)].duration });
  playCurrent();
}

function seek(seconds: number) {
  const t = Math.max(0, Math.min(seconds, state.duration || seconds));
  set({ time: t });
  player?.seekTo(t, true);
}

function shuffle() {
  const order = [...state.order];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  set({ order });
}

function open() {
  set({ view: "open" });
  void ensurePlayer().catch(() => {}); // warm up, so the first song starts instantly
}

/** Tucks the panel into the side if music is on; otherwise just closes it. */
function dock() {
  set({ view: state.playing || state.loading || state.started ? "docked" : "closed" });
}

function close() {
  pause();
  set({ view: "closed" });
}

export const music = {
  open,
  dock,
  close,
  select,
  toggle,
  pause,
  next,
  prev,
  seek,
  shuffle,
  back: () => set({ screen: "list" }),
  showTrack: () => set({ screen: "track" }),
};
