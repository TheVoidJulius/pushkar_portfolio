/**
 * The six songs in the "Listening to…" player.
 *
 * Audio streams from YouTube; covers are the official album artwork
 * (from the iTunes catalogue), saved in /public/music so the player never
 * depends on another site to render.
 */
export type Track = {
  slug: string;
  youtubeId: string;
  title: string;
  artist: string;
  album: string;
  year: string;
  cover: string;
  /** Album-version length in seconds, shown until YouTube reports the real one. */
  duration: number;
};

export const TRACKS: Track[] = [
  {
    slug: "straight-up",
    youtubeId: "Brtv3u22m2I",
    title: "Straight Up",
    artist: "Karan Aujla & MXRCI",
    album: "AUJLA SZN 1",
    year: "2026",
    cover: "/music/straight-up.jpg",
    duration: 215,
  },
  {
    slug: "plastic-love",
    youtubeId: "ls2JK6x6ycs",
    title: "Plastic Love",
    artist: "Mariya Takeuchi",
    album: "Variety",
    year: "1984",
    cover: "/music/plastic-love.jpg",
    duration: 474,
  },
  {
    slug: "earrings",
    youtubeId: "cEE1gFOvUlM",
    title: "Earrings",
    artist: "Malcolm Todd",
    album: "Sweet Boy",
    year: "2024",
    cover: "/music/earrings.jpg",
    duration: 152,
  },
  {
    slug: "body-to-body",
    youtubeId: "RBaSiVjtKR4",
    title: "Body to Body",
    artist: "BTS",
    album: "ARIRANG",
    year: "2026",
    cover: "/music/body-to-body.jpg",
    duration: 190,
  },
  {
    slug: "i-wanna-be-yours",
    youtubeId: "nyuo9-OjNNg",
    title: "I Wanna Be Yours",
    artist: "Arctic Monkeys",
    album: "AM",
    year: "2013",
    cover: "/music/i-wanna-be-yours.jpg",
    duration: 184,
  },
  {
    slug: "what-you-saying",
    youtubeId: "aY8m4DOvBh8",
    title: "What You Saying",
    artist: "Lil Uzi Vert",
    album: "What You Saying",
    year: "2025",
    cover: "/music/what-you-saying.jpg",
    duration: 132,
  },
];

export const youtubeUrl = (t: Track) => `https://www.youtube.com/watch?v=${t.youtubeId}`;
