import type { Mood } from "./protocol";

/** Fixed lines from scripted scenes (the terminal wake-up and the snow house). Pre-recorded by `npm run voice:bake`. */
export const SCENE_LINES = {
  wakeYawn: { mood: "gentle", text: "Mmh… five more minutes." },
  wakeUp: { mood: "excited", text: "I'm up! I'm up." },
  houseCold: { mood: "gentle", text: "Brr… it's freezing out here." },
  houseAgain: { mood: "gentle", text: "You again? I'm going back to bed." },
  houseNight: { mood: "gentle", text: "Night night. Whatever you do… don't knock." },
  houseWho: { mood: "surprised", text: "WHO'S KNOCKING?!" },
  houseTop: { mood: "excited", text: "I said DON'T knock. Back to the top with you!" },
  houseStay: { mood: "playful", text: "…and stay up here. I'm going back to sleep." },
} satisfies Record<string, { mood: Mood; text: string }>;
