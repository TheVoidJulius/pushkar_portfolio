// Generates original abstract placeholder artwork into public/placeholders.
// Everything here is replaced by real uploads from the admin dashboard.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public/placeholders");
mkdirSync(out, { recursive: true });

// deterministic PRNG so the art is stable between runs
function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

const covers = {
  lantern: { a: "#1d1b3a", b: "#ff9f43", c: "#ffd38a", motif: "rings" },
  tidepool: { a: "#06283d", b: "#1fb5c9", c: "#c2fff5", motif: "waves" },
  fieldnote: { a: "#f3ede2", b: "#6b8f71", c: "#2f3e33", motif: "lines" },
  switchboard: { a: "#111418", b: "#7c5cff", c: "#46e0a8", motif: "grid" },
  sprout: { a: "#eaf6e4", b: "#3c9a5f", c: "#ff8a65", motif: "leaves" },
  paperplanes: { a: "#fdf6ec", b: "#e5484d", c: "#1f2a44", motif: "planes" },
};

function cover(name, { a, b, c, motif }, seed) {
  const r = rng(seed);
  let shapes = "";
  if (motif === "rings") {
    for (let i = 7; i > 0; i--) shapes += `<circle cx="560" cy="300" r="${i * 46}" fill="none" stroke="${i % 2 ? b : c}" stroke-opacity="${0.15 + i * 0.08}" stroke-width="${2 + i}"/>`;
    shapes += `<circle cx="560" cy="300" r="40" fill="${c}"/>`;
  } else if (motif === "waves") {
    for (let i = 0; i < 9; i++) {
      const y = 140 + i * 42;
      shapes += `<path d="M0 ${y} C 200 ${y - 60}, 400 ${y + 60}, 800 ${y - 10}" fill="none" stroke="${i % 2 ? b : c}" stroke-opacity="${0.35 + i * 0.07}" stroke-width="3"/>`;
    }
    for (let i = 0; i < 60; i++) shapes += `<circle cx="${r() * 800}" cy="${r() * 500}" r="${r() * 2.4 + 0.4}" fill="${c}" fill-opacity="${r() * 0.8}"/>`;
  } else if (motif === "lines") {
    for (let i = 0; i < 14; i++) shapes += `<rect x="120" y="${80 + i * 26}" width="${260 + r() * 300}" height="6" rx="3" fill="${c}" fill-opacity="${0.12 + r() * 0.25}"/>`;
    shapes += `<circle cx="640" cy="140" r="70" fill="${b}"/>`;
  } else if (motif === "grid") {
    for (let x = 0; x < 10; x++)
      for (let y = 0; y < 6; y++) {
        const on = r() > 0.62;
        shapes += `<rect x="${60 + x * 70}" y="${50 + y * 70}" width="54" height="54" rx="12" fill="${on ? (r() > 0.5 ? b : c) : "#ffffff"}" fill-opacity="${on ? 0.9 : 0.05}"/>`;
      }
  } else if (motif === "leaves") {
    for (let i = 0; i < 12; i++) {
      const x = 80 + r() * 640, y = 60 + r() * 380, rot = r() * 360, s = 0.6 + r();
      shapes += `<path transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" d="M0 0 C 30 -40, 80 -40, 100 0 C 80 40, 30 40, 0 0Z" fill="${i % 4 ? b : c}" fill-opacity="0.85"/>`;
    }
  } else if (motif === "planes") {
    for (let i = 0; i < 7; i++) {
      const x = 60 + r() * 640, y = 60 + r() * 360, rot = -20 + r() * 40, s = 0.5 + r() * 0.9;
      shapes += `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})"><path d="M0 0 L120 30 L0 60 L25 30 Z" fill="${i % 3 ? c : b}"/><path d="M25 30 L120 30 L40 48Z" fill="#000" fill-opacity="0.15"/></g>`;
    }
    shapes += `<path d="M40 460 C 240 380, 420 520, 780 400" fill="none" stroke="${b}" stroke-dasharray="6 10" stroke-width="3"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" role="img" aria-label="${name} cover art">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${a}" stop-opacity="0.85"/></linearGradient>
<radialGradient id="glow" cx="0.75" cy="0.3" r="0.7"><stop offset="0" stop-color="${b}" stop-opacity="0.35"/><stop offset="1" stop-color="${b}" stop-opacity="0"/></radialGradient></defs>
<rect width="800" height="500" fill="url(#g)"/><rect width="800" height="500" fill="url(#glow)"/>${shapes}</svg>`;
  writeFileSync(path.join(out, `project-${name}.svg`), svg);
}

let seed = 7;
for (const [name, spec] of Object.entries(covers)) cover(name, spec, seed++ * 977);

const logos = { brightloop: ["B", "#ff7a59", "#fff4ef"], paperkite: ["P", "#3b6ef5", "#eef3ff"], halcyon: ["H", "#16a37f", "#e9fbf5"] };
for (const [name, [letter, fg, bg]] of Object.entries(logos)) {
  writeFileSync(
    path.join(out, `logo-${name}.svg`),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="${name} logo"><rect width="96" height="96" rx="24" fill="${bg}"/><circle cx="70" cy="26" r="10" fill="${fg}" fill-opacity="0.25"/><text x="48" y="63" text-anchor="middle" font-family="Georgia, serif" font-size="46" font-weight="700" fill="${fg}">${letter}</text></svg>`,
  );
}

// Illustrated portrait placeholder (abstract, not a real person)
const portrait = (bg1, bg2, file) =>
  writeFileSync(
    path.join(out, file),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 480" role="img" aria-label="Illustrated portrait placeholder">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient></defs>
<rect width="400" height="480" fill="url(#bg)"/>
<circle cx="320" cy="90" r="46" fill="#fff" fill-opacity="0.25"/>
<path d="M60 480 C 70 370, 130 330, 200 330 C 270 330, 330 370, 340 480Z" fill="#2a2440"/>
<path d="M170 300 L230 300 L226 345 C 214 356, 186 356, 174 345Z" fill="#f1c7a5"/>
<ellipse cx="200" cy="230" rx="78" ry="90" fill="#f6d3b5"/>
<path d="M118 228 C 110 140, 170 112, 214 118 C 270 124, 296 170, 284 236 C 274 196, 250 172, 210 168 C 172 166, 140 186, 118 228Z" fill="#3a2e4f"/>
<ellipse cx="172" cy="238" rx="7" ry="9" fill="#2a2440"/><ellipse cx="230" cy="238" rx="7" ry="9" fill="#2a2440"/>
<path d="M184 278 C 194 288, 210 288, 220 278" stroke="#c9826b" stroke-width="5" fill="none" stroke-linecap="round"/>
<ellipse cx="156" cy="266" rx="12" ry="7" fill="#ff9a9a" fill-opacity="0.45"/><ellipse cx="246" cy="266" rx="12" ry="7" fill="#ff9a9a" fill-opacity="0.45"/>
</svg>`,
  );
portrait("#ffd9c2", "#c9b8ff", "profile.svg");
portrait("#c2ecff", "#ffe3a8", "about.svg");

console.log("Placeholders written to", out);
