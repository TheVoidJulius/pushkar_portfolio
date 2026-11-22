// Pre-records everything Mikuro says, once, so visitors never spend credits.
//
//   npm run voice:bake          Dry run: lists the lines and the character cost
//   npm run voice:bake -- --yes Generates only clips that are missing or changed
//
// Covers section narration (built from supabase/seed-content.json), her quips
// (mikuro-lines.json) and the scripted scenes (wake-up, snow house).
// Clips go to public/voice/ (commit them); the site looks them up by text.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SCENE_LINES } from "../src/lib/assistant/scenes";
import { buildLines } from "../src/lib/assistant/tour";
import type { PortfolioContent } from "../src/lib/types";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "voice");
const manifestPath = join(outDir, "manifest.json");
const confirmed = process.argv.includes("--yes");

const key = process.env.ELEVENLABS_API_KEY?.trim();
const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim() || "e58ZQ25WJ8TTHDUkvhgh";
const model = process.env.ELEVENLABS_MODEL_ID?.trim() || "eleven_v3_conversational";
const api = process.env.ELEVENLABS_API_BASE || "https://api.elevenlabs.io/v1";
const num = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return process.env[name] && Number.isFinite(n) ? n : fallback;
};
const settings = {
  stability: num("ELEVENLABS_STABILITY", 0.5),
  similarity_boost: num("ELEVENLABS_SIMILARITY", 0.8),
  style: num("ELEVENLABS_STYLE", 0.55),
  use_speaker_boost: true,
  speed: num("ELEVENLABS_SPEED", 0.96),
};
if (/v3/i.test(model)) settings.stability = settings.stability < 0.25 ? 0 : settings.stability < 0.75 ? 0.5 : 1;

type Line = { mood: string; text: string };
const TAGS: Record<string, string> = {
  happy: "[cheerfully]", excited: "[excited]", curious: "[curious]", gentle: "[softly]",
  playful: "[playfully]", thinking: "[thoughtful]", confused: "[confused]", surprised: "[surprised]",
};
const tagged = (l: Line) => (/v3|v4/i.test(model) && TAGS[l.mood] ? `${TAGS[l.mood]} ${l.text}` : l.text);

// ---- every line, de-duplicated by text --------------------------------
const content = JSON.parse(readFileSync(join(root, "supabase", "seed-content.json"), "utf8")) as PortfolioContent;
const narration: Line[] = Object.values(buildLines(content)).flatMap((spec) => spec.texts.map((text) => ({ mood: spec.mood, text })));
const quips = Object.values(JSON.parse(readFileSync(join(root, "src", "lib", "assistant", "mikuro-lines.json"), "utf8")) as Record<string, Line[]>).flat();
const all = new Map<string, Line>();
for (const l of [...narration, ...quips, ...Object.values(SCENE_LINES), ...Object.values(NOW_LINES), ...Object.values(SOCIAL_LINES)]) if (l.text?.trim()) all.set(l.text, l);
const lines = [...all.values()];

const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};
const fileOf = (l: Line) =>
  `${createHash("sha256").update(`${voiceId}|${model}|${JSON.stringify(settings)}|${l.mood}|${l.text}`).digest("hex").slice(0, 16)}.mp3`;
const todo = lines.filter((l) => !(previous.clips?.[l.text] === `/voice/${fileOf(l)}` && existsSync(join(outDir, fileOf(l)))));
const chars = todo.reduce((n, l) => n + tagged(l).length, 0);

console.log(`Voice: ${voiceId}\nModel: ${model}`);
console.log(`Lines: ${lines.length} (${narration.length} narration, ${quips.length} quips, ${Object.keys(SCENE_LINES).length} scene)`);
console.log(`To generate: ${todo.length} lines, ~${chars} characters (≈ credits at 1 credit/char)`);
if (!confirmed) {
  console.log("\nDry run: nothing was generated. Re-run with --yes to spend the credits.");
  process.exit(0);
}
if (!key) {
  console.error("\nELEVENLABS_API_KEY is empty. Add it to .env.local first.");
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
const clips: Record<string, string> = {};
let failed = false;
for (const l of lines) {
  const file = fileOf(l);
  if (!todo.includes(l)) {
    clips[l.text] = `/voice/${file}`;
    continue;
  }
  if (failed) continue;
  const res = await fetch(`${api}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text: tagged(l), model_id: model, voice_settings: settings }),
  });
  if (!res.ok) {
    console.error(`Stopped at "${l.text.slice(0, 40)}": ElevenLabs returned ${res.status}. ${(await res.text()).slice(0, 300)}`);
    failed = true; // keep what succeeded; a re-run resumes from here
    continue;
  }
  writeFileSync(join(outDir, file), Buffer.from(await res.arrayBuffer()));
  clips[l.text] = `/voice/${file}`;
  console.log(`  ok  ${l.text.slice(0, 60)}`);
}
writeFileSync(manifestPath, `${JSON.stringify({ voiceId, model, clips }, null, 2)}\n`);
console.log(`Saved ${Object.keys(clips).length}/${lines.length} clips to public/voice/`);
