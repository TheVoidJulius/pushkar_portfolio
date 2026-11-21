// Pre-generates Mikuro's scripted one-liners once, so they cost no credits at runtime.
//
//   npm run voice:bake          Dry run: shows what it would generate and the cost
//   npm run voice:bake -- --yes Generates only clips that are missing or changed
//
// Files go to public/voice/ and should be committed.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "voice");
const manifestPath = join(outDir, "manifest.json");
const confirmed = process.argv.includes("--yes");

const key = process.env.ELEVENLABS_API_KEY?.trim();
const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim() || "MARYu78aD29mxoS37XE3";
const model = process.env.ELEVENLABS_MODEL_ID?.trim() || "eleven_v3_conversational";
const api = process.env.ELEVENLABS_API_BASE || "https://api.elevenlabs.io/v1";
const number = (name, fallback) => {
  const n = Number(process.env[name]);
  return process.env[name] && Number.isFinite(n) ? n : fallback;
};
const settings = {
  stability: number("ELEVENLABS_STABILITY", 0.5),
  similarity_boost: number("ELEVENLABS_SIMILARITY", 0.8),
  style: number("ELEVENLABS_STYLE", 0.55),
  use_speaker_boost: true,
  speed: number("ELEVENLABS_SPEED", 0.96),
};
if (/v3/i.test(model)) settings.stability = settings.stability < 0.25 ? 0 : settings.stability < 0.75 ? 0.5 : 1;

const TAGS = { happy: "[cheerfully]", excited: "[excited]", curious: "[curious]", gentle: "[softly]", playful: "[playfully]", thinking: "[thoughtful]", confused: "[confused]", surprised: "[surprised]" };
const tagged = (q) => (/v3|v4/i.test(model) ? `${TAGS[q.mood]} ${q.text}` : q.text);

const lines = JSON.parse(readFileSync(join(root, "src", "lib", "assistant", "mikuro-lines.json"), "utf8"));
const quips = Object.values(lines).flat();
const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};
const sameVoice = previous.voiceId === voiceId && previous.model === model;
const hashOf = (q) => createHash("sha256").update(`${voiceId}|${model}|${JSON.stringify(settings)}|${q.mood}|${q.text}`).digest("hex").slice(0, 12);

const todo = quips.filter((q) => {
  const file = `${q.id}-${hashOf(q)}.mp3`;
  return !(sameVoice && previous.clips?.[q.id] === `/voice/${file}` && existsSync(join(outDir, file)));
});
const chars = todo.reduce((n, q) => n + tagged(q).length, 0);

let multiplier = null;
if (key) {
  try {
    const res = await fetch(`${api}/models`, { headers: { "xi-api-key": key } });
    const found = res.ok ? (await res.json()).find((m) => m.model_id === model) : null;
    multiplier = found?.model_rates?.character_cost_multiplier ?? null;
  } catch {
    /* estimate below just omits the multiplier */
  }
}

console.log(`Voice: ${voiceId}\nModel: ${model}`);
console.log(`Lines: ${quips.length} total, ${todo.length} to generate, ${chars} characters`);
console.log(multiplier ? `Estimated cost: ${Math.ceil(chars * multiplier)} credits` : `Estimated cost: up to ${chars} credits (check your model's rate)`);

if (!confirmed) {
  console.log("\nDry run: nothing was generated. Re-run with --yes to spend the credits.");
  process.exit(0);
}
if (!key) {
  console.error("\nELEVENLABS_API_KEY is empty. Add it to .env.local first.");
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
const clips = {};
for (const q of quips) {
  const file = `${q.id}-${hashOf(q)}.mp3`;
  if (!todo.includes(q)) {
    clips[q.id] = `/voice/${file}`;
    continue;
  }
  const res = await fetch(`${api}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text: tagged(q), model_id: model, voice_settings: settings }),
  });
  if (!res.ok) {
    console.error(`Stopped at ${q.id}: ElevenLabs returned ${res.status}. ${(await res.text()).slice(0, 200)}`);
    break; // keep what succeeded; a re-run resumes from here
  }
  writeFileSync(join(outDir, file), Buffer.from(await res.arrayBuffer()));
  clips[q.id] = `/voice/${file}`;
  console.log(`  ok ${q.id}`);
}
writeFileSync(manifestPath, `${JSON.stringify({ voiceId, model, clips }, null, 2)}\n`);
console.log(`Saved ${Object.keys(clips).length} clips to public/voice/`);
