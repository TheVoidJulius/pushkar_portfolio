"use client";

import { ArrowUpRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GitHubActivity as Activity } from "@/lib/github";
import { useAssistant } from "../momo/AssistantProvider";
import { MomoLine } from "../momo/MomoLine";
import { FadeUp, SectionPill } from "./Chrome";
import { CommitBonsai } from "./github/CommitBonsai";
import { SocialIcon } from "./icons";
import { BLOSSOMS, useBonsai } from "./github/useBonsai";
import { SOCIAL_LINES } from "./social/lines";

type State = { status: "idle" | "loading" } | { status: "ready"; data: Activity } | { status: "error" };

const ago = (iso: string) => {
  const mins = Math.round((Date.now() - +new Date(iso)) / 60_000);
  if (!Number.isFinite(mins) || mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} hour${h === 1 ? "" : "s"} ago`;
  return `${Math.round(h / 24)} days ago`;
};

/**
 * "GitHub activity": the owner's real contribution history, grown into a
 * pixel bonsai. Data loads only as the section approaches the viewport.
 */
export function GitHubActivity({ showAssistant }: { showAssistant: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const [state, setState] = useState<State>({ status: "idle" });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        setState({ status: "loading" });
        fetch("/api/github")
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
          .then((data: Activity) => !cancelled && setState({ status: "ready", data }))
          .catch(() => !cancelled && setState({ status: "error" }));
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, []);

  const data = state.status === "ready" ? state.data : null;
  // The last 52 weeks only, so the tree and the numbers agree
  const year = useMemo(() => {
    if (!data) return null;

  /* water the tree */
  const bonsai = useBonsai(state.status !== "idle");
  const { showQuip } = useAssistant();
  const [picking, setPicking] = useState(false);
  const [pour, setPour] = useState(0);
  const [note, setNote] = useState("");
  const [localOnly, setLocalOnly] = useState(false);
  const water = useCallback(
    async (b: number) => {
      setPicking(false);
      setPour((k) => k + 1);
      const res = await bonsai.water(b);
      if (res === "rate_limited") {
        setNote("The tree has had plenty for now. Try again in a few minutes.");
        return;
      }
      setNote("");
      setLocalOnly(res === "local");
      const line = res === "local" ? SOCIAL_LINES.bonsaiLocal : SOCIAL_LINES.bonsaiWatered;
      showQuip({ id: res === "local" ? "bonsaiLocal" : "bonsaiWatered", ...line });
    },
    [bonsai, showQuip],
  );
  const everLocal = localOnly || (!bonsai.configured && bonsai.items.length > 0);
    const active = data.contributions.filter((d) => d.count > 0).length;
    const busiest = data.contributions.reduce((a, d) => (d.count > a.count ? d : a), { date: "", count: 0 });
    const perDay = data.contributions.reduce((n, d) => n + d.count, 0) / Math.max(1, data.contributions.length);
    return { active, busiest, perDay };
  }, [data]);

  return (
    <section id="github" ref={ref} aria-labelledby="github-title" className="container-page py-28 md:py-40">
      <div className="grid items-center gap-12 md:grid-cols-[minmax(0,1fr)_minmax(0,560px)] md:gap-16">
        <div>
          {showAssistant && <MomoLine id="github" size={96} className="-ml-2 mb-10" />}
          <FadeUp>
            <h2 id="github-title">
              <SectionPill n={4}>GitHub</SectionPill>
            </h2>
            <p className="mt-6 max-w-md text-[22px] leading-snug font-medium tracking-[-0.02em] text-ink md:text-[26px]">
              A year of commits, grown into a bonsai.
            </p>
            <p className="mt-4 max-w-md text-ink-3">
              Every branch tip is a week, oldest on the left. Commits grow the leaves, a commit every day of the week makes it
              blossom, and quiet weeks stay bare. The season follows the calendar. Hover or tap the tree to read a week.
            </p>

            {data && year && (
              <dl className="mt-8 grid max-w-md grid-cols-3 gap-3">
                {[
                  // The bonsai card already shows totals and streaks; these add to it
                  [String(year.active), "active days this year"],
                  [String(year.busiest.count), "on the busiest day"],
                  [year.perDay.toFixed(1), "a day, on average"],
                ].map(([v, k]) => (
                  <div key={k} className="flex flex-col-reverse justify-end rounded-2xl bg-surface px-4 py-3">
                    <dt className="mt-0.5 text-[12.5px] leading-tight text-ink-3">{k}</dt>
                    <dd className="font-mono text-[20px] font-medium text-ink tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
            )}

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <a
                href={data?.profileUrl ?? "https://github.com/TheVoidJulius"}
                target="_blank"
                rel="noreferrer me"
                className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[14.5px] font-medium text-bg transition hover:opacity-90"
              >
                <SocialIcon platform="github" className="size-[17px]" />
                {data ? `@${data.user}` : "GitHub"}
                <ArrowUpRight className="size-4" />
              </a>
              {data && <span className="font-mono text-[12px] text-ink-3">updated {ago(data.updatedAt)}</span>}
            </div>
          </FadeUp>
        </div>

        <FadeUp className="flex justify-center md:justify-end">
          {data ? (
            <CommitBonsai
              contributions={data.contributions}
              seed={data.user}
              weeks={52}
              label={`${data.user}'s bonsai`}
              waterings={bonsai.items}
              freshId={bonsai.fresh}
              pourKey={pour}
            />
          ) : (
            <div
              className="grid aspect-[560/640] w-full max-w-[560px] place-items-center rounded-[22px] border border-line bg-bg-elevated p-6 text-center text-ink-3 shadow-soft"
              aria-live="polite"
            >
              {state.status === "error" ? (
                <p>
                  The bonsai couldn&apos;t reach GitHub just now.
                  <br />
                  The full history is on the profile.
                </p>
              ) : (
                <p className="font-mono text-[12.5px] tracking-[0.12em] uppercase">Planting the seed…</p>
              )}

            {data && (
              <div className="mt-6 max-w-md">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setPicking((v) => !v)}
                    aria-expanded={picking}
                    aria-controls="bonsai-blossoms"
                    className="chrome-btn text-[14.5px] font-medium"
                  >
                    Water the tree <span aria-hidden className="ml-1.5">💧</span>
                  </button>
                  <span className="chip chip-mono" role="status">
                    {bonsai.total === 0
                      ? "Not watered yet"
                      : `Watered ${bonsai.total} time${bonsai.total === 1 ? "" : "s"}${bonsai.last ? ` · last by a visitor ${ago(bonsai.last)}` : ""}`}
                  </span>
                </div>
                {picking && (
                  <div id="bonsai-blossoms" role="group" aria-label="Pick a blossom to grow" className="mt-3 flex flex-wrap gap-2">
                    {BLOSSOMS.map((e, i) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => water(i)}
                        aria-label={`Water and grow blossom ${i + 1} of ${BLOSSOMS.length}`}
                        className="float-btn text-[20px] transition hover:-translate-y-0.5"
                      >
                        <span aria-hidden>{e}</span>
                      </button>
                    ))}
                  </div>
                )}
                {(note || everLocal) && (
                  <p className="mt-2 text-[12px] text-ink-3" aria-live="polite">
                    {note || "Saved on this device"}
                  </p>
                )}
              </div>
            )}
            </div>
          )}
        </FadeUp>
      </div>
    </section>
  );
}
