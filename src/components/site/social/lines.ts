/** Things Mikuro says about the social features (the lead pre-records these). */
export const SOCIAL_LINES = {
  bonsaiWatered: { mood: "happy", text: "Ooh, the little tree loves that. Thank you for watering it." },
  bonsaiLocal: { mood: "gentle", text: "I'll remember that one on this device. The tree is a bit shy online today." },
  catsFriend: { mood: "excited", text: "Someone else is here, and they brought a ghost cat. Say hi with your cursor." },
} as const;

/** What Mikuro says when she changes outfit in her wardrobe (see momo/wardrobe). */
export const WARDROBE_LINES = {
  chrome: { mood: "happy", text: "Back to classic chrome. Shiny, liquid, and very me." },
  winter: { mood: "excited", text: "Beanie on, scarf on. Now I can stay out in the snow all night." },
  hacker: { mood: "playful", text: "Hood up. I'm in. Don't ask what I'm hacking, it's just my cat flap." },
  royal: { mood: "playful", text: "Solid gold and a bow tie. You may now address me as Your Majesty." },
} as const;
