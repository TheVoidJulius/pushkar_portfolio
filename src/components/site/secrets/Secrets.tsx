"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Quip } from "@/lib/assistant/mikuro";
import { scrollToSection } from "@/lib/scroll";
import { useAssistant } from "../../momo/AssistantProvider";
import { isTyping, readFound, SECRETS, writeFound, type SecretId } from "./store";

const DevMode = dynamic(() => import("./DevMode"), { ssr: false });

const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];

const say = (id: string, mood: Quip["mood"], text: string): Quip => ({ id: `secret-${id}`, mood, text });

/** Hidden delights. Renders nothing until the first secret is found, then a tiny counter. */
export function Secrets() {
  const a = useAssistant();
  const live = useRef(a);
  useEffect(() => {
    live.current = a;
  });
  const [found, setFound] = useState<SecretId[]>([]);
  const foundRef = useRef<SecretId[]>([]);
  const [dev, setDev] = useState(false);
  const closeDev = useCallback(() => setDev(false), []);

  const unlock = useCallback((id: SecretId) => {
    if (foundRef.current.includes(id)) return;
    foundRef.current = [...foundRef.current, id];
    setFound(foundRef.current);
    writeFound(foundRef.current);
  }, []);

  useEffect(() => {
    foundRef.current = readFound();
    setFound(foundRef.current);

    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const quip = (q: Quip) => live.current.showQuip(q, true);

    /** Mikuro flips: animates her canvas host, so the renderer needs no changes. */
    const onTrick = () => {
      const host = document.querySelector<HTMLElement>("[data-mikuro-state] > div[aria-hidden]");
      if (!host || reduced) return;
      host.animate(
        [
          { transform: "translateY(0) rotate(0)" },
          { transform: "translateY(-38%) rotate(-180deg)", offset: 0.45 },
          { transform: "translateY(0) rotate(-360deg)" },
        ],
        { duration: 900, easing: "cubic-bezier(.3,.7,.4,1)" },
      );
    };
    window.addEventListener("mikuro:trick", onTrick);

    let kIdx = 0;
    let buf = "";
    let clicks: number[] = [];

    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      kIdx = k === KONAMI[kIdx] ? kIdx + 1 : k === KONAMI[0] ? 1 : 0;
      if (kIdx === KONAMI.length) {
        kIdx = 0;
        window.dispatchEvent(new CustomEvent("mikuro:trick", { detail: "backflip" }));
        quip(say("konami", "excited", "Developer mode unlocked. Don't break anything, I live in here."));
        unlock("konami");
        setDev(true);
      }
      if (e.key.length !== 1) return;
      buf = (buf + k).replace(/\s/g, "").slice(-20);
      if (buf.endsWith("meow")) {
        buf = "";
        window.dispatchEvent(new CustomEvent("mikuro:trick", { detail: "spin" }));
        quip(say("meow", "playful", "Meow. ...Was that you? Do it again."));
        unlock("meow");
      } else if (buf.endsWith("sudohirepushkar")) {
        buf = "";
        quip(say("sudo", "excited", "[sudo] password accepted. Excellent taste. Opening the contact page."));
        unlock("sudo");
        scrollToSection("contact");
      }
    };

    const onClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement | null)?.closest?.("[data-mikuro-state]")) return;
      const now = Date.now();
      clicks = [...clicks.filter((t) => now - t < 4000), now];
      if (clicks.length >= 10) {
        clicks = [];
        quip(say("annoyed", "confused", "Ten pokes. TEN. I am a liquid-chrome professional."));
        unlock("annoyed");
      }
    };

    window.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick, true);

    // Console greeting for the curious developer.
    const w = window as unknown as { mikuro?: { hello: () => string } };
    w.mikuro = {
      hello: () => {
        unlock("console");
        quip(say("console", "playful", "I heard that in the console. Hello, fellow developer."));
        return "mrrp. secret found.";
      },
    };
    console.log(
      "%c /\\_/\\\n( o.o )  mikuro\n > ^ <\n%cCurious? Type %cmikuro.hello()%c here. There are other secrets too (try the Konami code).",
      "color:#e0527a;font:bold 14px monospace",
      "color:inherit;font:12px sans-serif",
      "color:#e0527a;font:bold 12px monospace",
      "color:inherit;font:12px sans-serif",
    );

    return () => {
      window.removeEventListener("mikuro:trick", onTrick);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick, true);
      delete w.mikuro;
    };
  }, [unlock]);

  return (
    <>
      {dev && <DevMode onClose={closeDev} />}
      {found.length > 0 && (
        <p
          aria-label={`Secrets found: ${found.length} of ${SECRETS.length}`}
          className="pointer-events-none fixed right-3 bottom-3 z-[44] rounded-full bg-[color:var(--bg-elevated)]/80 px-2.5 py-1 font-mono text-[10px] opacity-60 backdrop-blur"
        >
          secrets {found.length}/{SECRETS.length}
        </p>
      )}
    </>
  );
}
