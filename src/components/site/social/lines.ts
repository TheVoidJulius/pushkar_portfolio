/** Things Mikuro says about the social features (the lead pre-records these). */
export const SOCIAL_LINES = {
  bonsaiWatered: { mood: "happy", text: "Ooh, the little tree loves that. Thank you for watering it." },
  bonsaiLocal: { mood: "gentle", text: "I'll remember that one on this device. The tree is a bit shy online today." },
  catsFriend: { mood: "excited", text: "Someone else is here, and they brought a ghost cat. Say hi with your cursor." },
  catsCities: { mood: "happy", text: "Look at the little globe. Every glowing dot is a city a cat came from today." },
} as const;

/** One festive line per session while a festival is on (keyed by festival id). */
export const FESTIVE_LINES = {
  diwali: { mood: "happy", text: "Happy Diwali! I lit a few tiny diyas around the igloo. Mind the flames, they are warm." },
  holi: { mood: "excited", text: "Happy Holi! The snow is getting colourful. I am not responsible for any powder on my fur." },
  navratri: { mood: "happy", text: "Shubh Navratri! The igloo is wearing its marigold lights tonight." },
  rakhi: { mood: "gentle", text: "Happy Raksha Bandhan. Go call your sibling, I will keep the site warm." },
  republic: { mood: "gentle", text: "Happy Republic Day. A little bunting is up outside the igloo." },
  independence: { mood: "gentle", text: "Happy Independence Day. A little bunting is up outside the igloo." },
  newyear: { mood: "excited", text: "Happy New Year! Look up, there are fireworks over the igloo." },
  december: { mood: "happy", text: "It is December, so the snow is thicker and the igloo has fairy lights. Cosy." },
} as const;
