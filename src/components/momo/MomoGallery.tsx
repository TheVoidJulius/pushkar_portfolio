"use client";

import { useState } from "react";
import { MomoHead } from "./MomoHead";
import { EXPRESSIONS, type Expression } from "./three/MomoRenderer";

/** One live 3D Momo with buttons to try every expression (admin). */
export function MomoGallery() {
  const [expression, setExpression] = useState<Expression>("idle");
  const [talking, setTalking] = useState(false);
  return (
    <div className="grid items-center gap-5 sm:grid-cols-[220px_minmax(0,1fr)]">
      <MomoHead expression={expression} talking={talking} className="mx-auto aspect-square w-[220px]" />
      <div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Expressions">
          {EXPRESSIONS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setExpression(e)}
              aria-pressed={expression === e}
              className={`rounded-full px-3 py-1.5 font-mono text-[12px] capitalize transition ${
                expression === e ? "bg-ink text-bg" : "border border-line text-ink-2 hover:border-line-strong hover:text-ink"
              }`}
            >
              {e}
            </button>
          ))}
        </div>
        <label className="mt-4 flex items-center gap-2 text-[14px] text-ink-2">
          <input type="checkbox" checked={talking} onChange={(e) => setTalking(e.target.checked)} className="accent-[var(--accent)]" />
          Make her talk
        </label>
      </div>
    </div>
  );
}
