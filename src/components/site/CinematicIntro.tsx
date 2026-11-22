"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useAssistant } from "../momo/AssistantProvider";
import { INTRO_KEY, REPLAY_EVENT } from "./introControl";

const DURATION = 3.1; // seconds, including the reveal into the hero
const MAX_SHADER_WAIT_MS = 1200; // never hold visitors up for a slow GPU
/** When the iris starts to open (the 3D Mikuro takes over from the silhouette). */
const REVEAL_AT = 2.36;

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

/**
 * A pool of liquid chrome: droplets drift together, merge into a cat's
 * silhouette, then an iris opens from it onto the site. The surface is a
 * height field lit by a procedural studio, so no textures need to load.
 */
const FRAG = `precision highp float;
uniform vec2 uRes; uniform float uT; uniform float uSleep;
float smin(float a, float b, float k){ float h = clamp(.5 + .5*(b-a)/k, 0., 1.); return mix(b,a,h) - k*h*(1.-h); }
float ease(float a, float b, float x){ float t = clamp((x-a)/(b-a),0.,1.); return t*t*(3.-2.*t); }
float tri(vec2 p, vec2 a, vec2 b, vec2 c){
  vec2 e0=b-a,e1=c-b,e2=a-c,v0=p-a,v1=p-b,v2=p-c;
  vec2 q0=v0-e0*clamp(dot(v0,e0)/dot(e0,e0),0.,1.);
  vec2 q1=v1-e1*clamp(dot(v1,e1)/dot(e1,e1),0.,1.);
  vec2 q2=v2-e2*clamp(dot(v2,e2)/dot(e2,e2),0.,1.);
  float s=sign(e0.x*e2.y-e0.y*e2.x);
  vec2 d=min(min(vec2(dot(q0,q0),s*(v0.x*e0.y-v0.y*e0.x)),vec2(dot(q1,q1),s*(v1.x*e1.y-v1.y*e1.x))),vec2(dot(q2,q2),s*(v2.x*e2.y-v2.y*e2.x)));
  return -sqrt(d.x)*sign(d.y);
}
float cat(vec2 p){
  float head = length(p*vec2(1.,1.06)) - .3;
  float l = tri(p, vec2(-.285,.1), vec2(-.25,.42), vec2(-.05,.27)) - .018;
  float r = tri(p, vec2(.285,.1), vec2(.05,.27), vec2(.25,.42)) - .018;
  return smin(head, min(l,r), .035);
}
float blobs(vec2 p, float t){
  float d = 1e3;
  for(int i=0;i<6;i++){
    float f = float(i);
    float a = f*1.047 + t*.7;
    float r = mix(.72, .05, ease(.25,1.25,t));
    vec2 c = vec2(cos(a), sin(a*1.3))*r;
    d = smin(d, length(p-c) - (.05 + .022*f)*ease(.05,.55,t), .16);
  }
  return d;
}
float field(vec2 p){
  float wob = sin(p.y*9. + uT*3.)*sin(p.x*7. - uT*2.3)*.012*(1.-ease(1.5,2.1,uT));
  return mix(blobs(p,uT), cat(p/.74)*.74, ease(1.05,1.75,uT)) + wob;
}
vec3 studio(vec3 r){
  float h = r.y + .05*sin(r.x*4. + uT*.8) + .02*sin(r.x*9. - uT*.5);
  vec3 c = mix(vec3(1.,1.01,1.05), vec3(.36,.39,.5), smoothstep(-.42,.6,h));
  c = mix(c, vec3(1.5), smoothstep(.66,.94,h));
  c = mix(c, vec3(.022,.024,.034), 1. - smoothstep(-.6,-.49,h));
  c = mix(c, vec3(.66,.66,.72), 1. - smoothstep(-.96,-.76,h));
  c += vec3(1.7)*smoothstep(.07,.0,abs(r.x + .66 + .05*sin(r.y*4. - uT*.5)))*smoothstep(-.3,.1,r.y);
  return c;
}
void main(){
  vec2 p = (gl_FragCoord.xy - .5*uRes)/min(uRes.x,uRes.y);
  p.y -= .02;
  float d = field(p);
  float aa = 1.6/min(uRes.x,uRes.y);

  // faint reflections on the dark floor, before anything has formed
  float sweep = smoothstep(.2,.0,abs(p.x + p.y*.45 - mix(-1.5,1.5,ease(.0,1.4,uT))));
  vec3 col = vec3(.012,.012,.017) + vec3(.05,.052,.065)*sweep*(1.-ease(1.4,2.,uT));
  col += vec3(.035,.036,.05)*smoothstep(.5,.0,d)*ease(.3,1.4,uT);

  if(d < aa*2.){
    // A wide gradient rounds the silhouette's creases into a soft, poured bevel
    const float e = .028;
    vec2 g = vec2(field(p+vec2(e,0.))-d, field(p+vec2(0.,e))-d)/e;
    float depth = clamp(-d/.075,0.,1.);
    float dome = sqrt(1.-(1.-depth)*(1.-depth));
    vec3 n = normalize(vec3(g*(1.-dome)*.95 + p*1.9, .62+dome*.5));
    vec3 r = reflect(vec3(0.,0.,-1.), n);
    vec3 m = studio(r)*vec3(.97,.98,1.03);
    float fres = pow(1.-max(n.z,0.),3.);
    m += fres*vec3(.5,.54,.65);
    // eyes open just before the reveal
    float eyes = ease(1.75,1.98,uT)*(1.-uSleep);
    vec2 cp = p/.74;
    vec2 q = vec2(abs(cp.x)-.125, cp.y+.015);
    float eye = length(q*vec2(1.,mix(9.,1.08,eyes))) - .056;
    m = mix(m, vec3(.012,.012,.02), smoothstep(aa,-aa,eye)*ease(1.65,1.76,uT));
    float inside = smoothstep(aa,-aa,eye);
    m += vec3(1.,.72,.3)*smoothstep(aa,-aa,length(q-vec2(.0,-.004))-.034)*eyes*inside;
    m = mix(m, vec3(1.), smoothstep(aa,-aa,length(q-vec2(-.016,.022))-.012)*eyes*inside);
    col = mix(m, col, smoothstep(-aa,aa,d));
  }

  // iris opening out of the cat, showing the page beneath
  float open = ease(2.42,3.05,uT);
  float radius = open*open*1.6*max(uRes.x,uRes.y)/min(uRes.x,uRes.y);
  float hole = length(p) - radius;
  float edge = smoothstep(.05,.0,abs(hole))*step(.001,open);
  col += vec3(.8,.84,.95)*edge*.9;
  float alpha = open > 0. ? smoothstep(-.012,.012,hole) : 1.;
  alpha = max(alpha, edge*.75);
  gl_FragColor = vec4(col*alpha, alpha);
}`;

function compile(gl: WebGLRenderingContext) {
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s; // status is checked after linking, so compilation can run in the background
  };
  const vs = shader(gl.VERTEX_SHADER, VERT);
  const fs = shader(gl.FRAGMENT_SHADER, FRAG);
  const prog = gl.createProgram();
  if (!vs || !fs || !prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  return prog;
}

/** A soft metallic shimmer. Only audible on a replay, after a click. */
function shimmer() {
  try {
    const ctx = new AudioContext();
    if (ctx.state !== "running") {
      void ctx.close();
      return;
    }
    const now = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, now);
    out.gain.linearRampToValueAtTime(0.045, now + 0.5);
    out.gain.exponentialRampToValueAtTime(0.0001, now + 2.3);
    out.connect(ctx.destination);
    [392, 587.33, 1174.66, 1567.98].forEach((freq, i) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(freq * 0.985, now);
      o.frequency.exponentialRampToValueAtTime(freq, now + 1);
      const g = ctx.createGain();
      g.gain.value = 1 / (i + 1.5);
      o.connect(g).connect(out);
      o.start(now + i * 0.09);
      o.stop(now + 2.4);
    });
    setTimeout(() => void ctx.close(), 2700);
  } catch {
    /* no audio: the visuals carry it */
  }
}

type Stage = "terminal" | "shader";

/**
 * First visit: a terminal waits at `wake mikuro`. Enter (or a tap) dissolves
 * it into chrome droplets that pool into Mikuro's sleeping silhouette; the
 * real 3D Mikuro takes over in the same spot, wakes up, and the site's
 * usual intro and narration carry on. Without the assistant, the chrome
 * intro plays on its own.
 */
export function CinematicIntro() {
  const { finishCinema, beginWake, wakeGesture, wakeUp, assistantVisible, ownerName, settings, muted, musicOn } = useAssistant();
  const [run, setRun] = useState(0); // 0 = not playing
  const [stage, setStage] = useState<Stage>("terminal");
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const titleRef = useRef<HTMLParagraphElement>(null);
  const skipRef = useRef<HTMLButtonElement>(null);
  /** Mikuro was woken from the terminal (so she wakes up on screen at the end). */
  const woke = useRef(false);
  const useTerminal = assistantVisible;

  const end = useCallback(() => {
    try {
      sessionStorage.setItem(INTRO_KEY, "1");
    } catch {
      /* storage blocked: it may simply play again */
    }
    document.documentElement.removeAttribute("data-intro");
    setRun(0);
    if (woke.current) wakeUp(); // harmless if the reveal already started it
    else finishCinema();
    woke.current = false;
  }, [finishCinema, wakeUp]);

  // Decide on load: play once per session, never for reduced motion
  useEffect(() => {
    if (document.documentElement.hasAttribute("data-intro")) {
      const t = setTimeout(() => {
        setStage(useTerminal ? "terminal" : "shader");
        setRun(1);
      }, 0);
      return () => clearTimeout(t);
    }
    finishCinema();
  }, [finishCinema, useTerminal]);

  useEffect(() => {
    const onReplay = () => {
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      if (!useTerminal) shimmer();
      woke.current = false;
      setStage(useTerminal ? "terminal" : "shader");
      setRun((n) => n + 1);
    };
    window.addEventListener(REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(REPLAY_EVENT, onReplay);
  }, [useTerminal]);

  // While the terminal shows, Mikuro waits asleep where the silhouette will form
  useEffect(() => {
    if (!run || stage !== "terminal") return;
    beginWake();
    document.documentElement.removeAttribute("data-intro"); // the terminal covers the page itself
  }, [run, stage, beginWake]);

  /** Enter pressed: runs inside the key/tap gesture, so audio is allowed. */
  const onEnter = useCallback(() => {
    woke.current = true;
    wakeGesture();
    if (!muted && !musicOn) shimmer();
  }, [wakeGesture, muted, musicOn]);
  const onWake = useCallback(() => setStage("shader"), []);

  useEffect(() => {
    if (!run || stage !== "shader") return;
    const canvas = canvasRef.current;
    const gl = canvas?.getContext("webgl", { alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: "high-performance" });
    const prog = gl ? compile(gl) : null;
    if (!canvas || !gl || !prog) {
      const t = setTimeout(end, 0); // no WebGL: go straight to the site (and the wake-up)
      return () => clearTimeout(t);
    }
    // No real GPU (CPU rendering): a full-screen shader would only make people wait
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const gpu = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
    if (/swiftshader|llvmpipe|software|basic render/i.test(gpu)) {
      const t = setTimeout(end, 0);
      return () => clearTimeout(t);
    }
    // The cover has done its job once the canvas exists
    document.documentElement.removeAttribute("data-intro");
    skipRef.current?.focus({ preventScroll: true });

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.clearColor(0.02, 0.02, 0.028, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    let uRes: WebGLUniformLocation | null = null;
    let uT: WebGLUniformLocation | null = null;
    const parallel = gl.getExtension("KHR_parallel_shader_compile") as { COMPLETION_STATUS_KHR: number } | null;
    const waitStart = performance.now();
    let ready = false;
    let revealed = false;

    // Starts light and only sharpens once the device proves it can keep up
    let detail = 0.5;
    let capped = false;
    const resize = () => {
      // Full-screen shaders are costly: cap the pixel count, CSS scales it up
      const w = innerWidth;
      const h = innerHeight;
      const scale = Math.min(Math.min(devicePixelRatio || 1, 1.5), Math.sqrt(1_100_000 / (w * h))) * detail;
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      gl.viewport(0, 0, canvas.width, canvas.height);
      if (ready) gl.uniform2f(uRes, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    // Hard limit: a background tab or stalled GPU can never hold the site hostage
    const failsafe = setTimeout(end, (DURATION + 2) * 1000);
    let raf = 0;
    let start = 0;
    let previous = 0;
    let sampled = 0;
    let slow = 0;
    const frame = (now: number) => {
      // Shaders compile off the main thread, so the page and Skip stay responsive
      if (!ready) {
        if (parallel && !gl.getProgramParameter(prog, parallel.COMPLETION_STATUS_KHR)) {
          if (performance.now() - waitStart > MAX_SHADER_WAIT_MS) end();
          else raf = requestAnimationFrame(frame);
          return;
        }
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
          end();
          return;
        }
        gl.useProgram(prog);
        const loc = gl.getAttribLocation(prog, "p");
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        uRes = gl.getUniformLocation(prog, "uRes");
        uT = gl.getUniformLocation(prog, "uT");
        // Woken from the terminal: the silhouette keeps its eyes shut, the 3D Mikuro opens them
        gl.uniform1f(gl.getUniformLocation(prog, "uSleep"), woke.current ? 1 : 0);
        gl.clearColor(0, 0, 0, 0);
        ready = true;
        resize();
        if (rootRef.current) rootRef.current.style.background = "transparent"; // the canvas paints the dark now
      }
      start ||= now;
      const t = (now - start) / 1000;
      // As the iris opens, the real Mikuro is waiting right behind the silhouette
      if (!revealed && woke.current && t >= REVEAL_AT) {
        revealed = true;
        wakeUp();
      }
      if (t >= DURATION) {
        end();
        return;
      }
      // Struggling GPU: drop back to low detail, then give up rather than stutter
      if (previous) {
        if (now - previous > 400) {
          end(); // a single huge stall: this device can't carry it
          return;
        }
        sampled++;
        if (now - previous > 45) slow++;
        if (sampled === 12) {
          if (slow >= 6 && detail === 1) {
            detail = 0.5;
            capped = true;
            resize();
          } else if (slow >= 6) {
            end();
            return;
          } else if (detail < 1 && !capped) {
            detail = 1;
            resize();
          }
          sampled = 0;
          slow = 0;
        }
      }
      previous = now;
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uT, t);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (titleRef.current) {
        const inn = Math.min(1, Math.max(0, (t - 1.55) / 0.42));
        const out = Math.min(1, Math.max(0, (t - 2.28) / 0.2));
        const y = (1 - inn) * (1 - inn) * 14;
        titleRef.current.style.opacity = String(inn * (1 - out));
        titleRef.current.style.transform = `translate3d(-50%, ${y.toFixed(2)}px, 0)`;
        titleRef.current.style.letterSpacing = `${(0.42 - inn * 0.1).toFixed(3)}em`;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") end();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(failsafe);
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKey);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(prog);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [run, stage, end, wakeUp]);

  return (
    <>
      {/* Where the sleeping 3D Mikuro waits: exactly behind the chrome silhouette */}
      {useTerminal && (
        <div
          data-momo-anchor="wake"
          aria-hidden
          className="pointer-events-none fixed top-1/2 left-1/2 size-[64vmin] -translate-x-1/2 -translate-y-[54%]"
        />
      )}
      {run ? (
        // Keyed per run: a WebGL context can't be reused after being released
        <div
          key={run}
          ref={rootRef}
          className="fixed inset-0 z-[210]"
          style={{ background: "#050507" }}
          role="dialog"
          aria-label={stage === "terminal" ? `Wake ${settings.name}` : "Intro animation"}
        >
          {stage === "shader" && <canvas ref={canvasRef} aria-hidden className="absolute inset-0 h-full w-full" />}
          <AnimatePresence>
            {stage === "terminal" && <Terminal key="terminal" owner={ownerName} name={settings.name} onEnter={onEnter} onWake={onWake} />}
          </AnimatePresence>
          {stage === "shader" && (
            <p
              ref={titleRef}
              aria-hidden
              className="pointer-events-none absolute top-[calc(50%+min(24vw,24vh)+6px)] left-1/2 font-mono text-[13px] whitespace-nowrap uppercase opacity-0 sm:text-[15px]"
              style={{
                background: "linear-gradient(105deg,#fff 10%,#8e909c 38%,#fff 52%,#71737e 74%,#e9eaf0)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              {settings.name}
            </p>
          )}
          <button
            ref={skipRef}
            type="button"
            onPointerDown={end}
            onClick={end}
            className="absolute right-4 bottom-[max(16px,env(safe-area-inset-bottom))] z-10 rounded-full border border-white/20 bg-black/40 px-4 py-2 text-[13px] text-white/75 transition-colors hover:bg-white/12 hover:text-white"
          >
            Skip intro
          </button>
        </div>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// The terminal
// ---------------------------------------------------------------------------

type Entry = { kind: "cmd" | "out"; text: string; tone?: "dim" | "accent" | "warn" | "ok" };

const TONE: Record<NonNullable<Entry["tone"]>, string> = {
  dim: "text-white/45",
  accent: "text-[#ff8fbf]",
  warn: "text-[#ffc25c]",
  ok: "text-[#5ee0b0]",
};

const noop = () => () => {};
const useHost = () => useSyncExternalStore(noop, () => window.location.host || "portfolio", () => "portfolio");
const useCoarsePointer = () => useSyncExternalStore(noop, () => matchMedia("(pointer: coarse)").matches, () => false);

function Terminal({ owner, name, onEnter, onWake }: { owner: string; name: string; onEnter: () => void; onWake: () => void }) {
  const host = useHost();
  const touch = useCoarsePointer();
  const first = (owner.split(" ")[0] || "portfolio").toLowerCase();
  const cat = name.toLowerCase();
  const script = useMemo<Entry[]>(
    () => [
      { kind: "cmd", text: `ssh guest@${host}` },
      { kind: "out", text: `Welcome to ${owner}'s portfolio.`, tone: "dim" },
      { kind: "cmd", text: "ls" },
      { kind: "out", text: "projects/  skills/  experience/  github/  about/  contact/" },
      { kind: "cmd", text: `systemctl status ${cat}` },
      { kind: "out", text: `● ${cat}.service — liquid-chrome companion`, tone: "accent" },
      { kind: "out", text: "   Active: inactive (napping) since you arrived", tone: "warn" },
      { kind: "out", text: "   Dreams: rendering in 3D, mostly about tuna", tone: "dim" },
    ],
    [host, owner, cat],
  );
  const command = `wake ${cat}`;
  const wakeLines = useMemo<Entry[]>(
    () => [
      { kind: "out", text: "[ ok ] warming the chrome ··········· 37°C", tone: "ok" },
      { kind: "out", text: "[ ok ] gathering droplets ··········· 6/6", tone: "ok" },
      { kind: "out", text: `[ ok ] ✦ ${name} is waking up`, tone: "ok" },
    ],
    [name],
  );

  const [pos, setPos] = useState({ i: 0, c: 0 }); // entries shown / characters typed of the current command
  const [phase, setPhase] = useState<"typing" | "ready" | "waking">("typing");
  const [shownWake, setShownWake] = useState(0);
  const total = script.length;

  // Type the session out like someone is at the keyboard
  useEffect(() => {
    if (phase !== "typing") return;
    const { i, c } = pos;
    let ms: number;
    let next: { i: number; c: number } | null;
    if (i < total) {
      const e = script[i];
      if (e.kind === "cmd" && c < e.text.length) {
        ms = c === 0 ? 160 : 14 + Math.random() * 22;
        next = { i, c: c + 1 };
      } else {
        ms = e.kind === "cmd" ? 150 : 55;
        next = { i: i + 1, c: 0 };
      }
    } else if (c < command.length) {
      ms = c === 0 ? 380 : 45 + Math.random() * 45;
      next = { i, c: c + 1 };
    } else {
      ms = 120;
      next = null;
    }
    const t = setTimeout(() => (next ? setPos(next) : setPhase("ready")), ms);
    return () => clearTimeout(t);
  }, [pos, phase, script, total, command]);

  const wake = useCallback(() => {
    if (phase === "waking") return;
    setPhase("waking");
    setPos({ i: total, c: command.length }); // Enter mid-typing just finishes the line
    onEnter();
  }, [phase, total, command, onEnter]);

  // The boot lines tick in, then the terminal dissolves into the chrome
  useEffect(() => {
    if (phase !== "waking") return;
    if (shownWake < wakeLines.length) {
      const t = setTimeout(() => setShownWake((n) => n + 1), 170);
      return () => clearTimeout(t);
    }
    const t = setTimeout(onWake, 420);
    return () => clearTimeout(t);
  }, [phase, shownWake, wakeLines.length, onWake]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      // Enter on another button (e.g. Skip) belongs to that button
      if ((e.target as HTMLElement | null)?.closest?.("button:not([data-wake])")) return;
      e.preventDefault();
      wake();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [wake]);

  const promptTag = (
    <span className="select-none">
      <span className="text-[#7ee0ff]">guest@{first}</span>
      <span className="text-white/40">:</span>
      <span className="text-[#a99cff]">~</span>
      <span className="text-white/40">$ </span>
    </span>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.55, filter: "blur(16px)", transition: { duration: 0.6, ease: [0.5, 0, 0.75, 0] } }}
      transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
      className="absolute inset-0 flex flex-col items-center justify-center gap-6 p-4"
    >
      {/* chrome glow pooling behind the window: where the droplets will come from */}
      <span aria-hidden className="terminal-glow" />
      <p className="sr-only">
        {touch ? `Tap the button to wake ${name}.` : `Press Enter to wake ${name}.`} Or use Skip intro.
      </p>

      <div aria-hidden className="terminal-window relative w-full max-w-[640px] overflow-hidden rounded-[18px]">
        <div className="flex h-10 items-center gap-2 border-b border-white/[0.07] px-4">
          <span className="size-3 rounded-full bg-[#ff5f57]" />
          <span className="size-3 rounded-full bg-[#febc2e]" />
          <span className="size-3 rounded-full bg-[#28c840]" />
          <span className="flex-1 pr-12 text-center font-mono text-[12px] text-white/40">guest@{first} — ~ — zsh</span>
        </div>
        <div className="min-h-[270px] px-5 py-4 font-mono text-[12.5px] leading-[1.8] text-white/85 sm:text-[13.5px]">
          {script.map((e, k) => {
            if (k > pos.i || (k === pos.i && (e.kind === "out" || pos.c === 0))) return null;
            const text = k === pos.i ? e.text.slice(0, pos.c) : e.text;
            return (
              <p key={k} className={`break-all whitespace-pre-wrap ${e.tone ? TONE[e.tone] : ""}`}>
                {e.kind === "cmd" && promptTag}
                {text}
              </p>
            );
          })}
          {pos.i >= total && (
            <p className="whitespace-pre-wrap">
              {promptTag}
              <span className="terminal-cmd">{command.slice(0, pos.c)}</span>
              {phase !== "waking" && <span className="terminal-cursor" />}
            </p>
          )}
          {wakeLines.slice(0, shownWake).map((e, k) => (
            <p key={`w${k}`} className={e.tone ? TONE[e.tone] : ""}>
              {e.text}
            </p>
          ))}
        </div>
      </div>

      <motion.button
        type="button"
        data-wake
        onClick={wake}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: phase === "waking" ? 0 : 1, y: 0 }}
        transition={{ delay: phase === "waking" ? 0 : 0.6, duration: 0.4 }}
        className="terminal-hint inline-flex items-center gap-2.5 rounded-full px-5 py-2.5 text-[14px] text-white/85"
      >
        {touch ? (
          <>Tap to wake {name}</>
        ) : (
          <>
            Press <kbd className="rounded-md border border-white/25 bg-white/10 px-2 py-0.5 font-mono text-[12.5px]">Enter ↵</kbd> to wake{" "}
            {name}
          </>
        )}
      </motion.button>
    </motion.div>
  );
}
