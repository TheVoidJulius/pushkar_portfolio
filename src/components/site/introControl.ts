export const INTRO_KEY = "mikuro-intro";
export const REPLAY_EVENT = "mikuro:replay-intro";

export const replayIntro = () => window.dispatchEvent(new Event(REPLAY_EVENT));
