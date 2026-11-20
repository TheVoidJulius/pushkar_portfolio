"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

type Theme = "light" | "dark";

export function applyTheme(next: Theme) {
  const root = document.documentElement;
  root.classList.add("theme-transition");
  root.dataset.theme = next;
  try {
    localStorage.setItem("theme", next);
  } catch {
    /* storage unavailable — theme still applies for this visit */
  }
  window.setTimeout(() => root.classList.remove("theme-transition"), 500);
}

// The <html data-theme> attribute is the source of truth (set before paint).
function subscribe(onChange: () => void) {
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}
const getTheme = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

export function useTheme() {
  return useSyncExternalStore<Theme | null>(subscribe, getTheme, () => null);
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useTheme();

  // Follow the system preference until the visitor picks a theme explicitly
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => {
      try {
        if (localStorage.getItem("theme")) return;
      } catch {
        /* ignore */
      }
      document.documentElement.dataset.theme = e.matches ? "dark" : "light";
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={() => applyTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Light theme" : "Dark theme"}
      className={`relative grid size-10 place-items-center overflow-hidden rounded-full border border-line text-ink-2 transition hover:border-line-strong hover:text-ink ${className}`}
    >
      <Sun
        className={`absolute size-[18px] transition-all duration-500 ${isDark ? "translate-y-6 rotate-90 opacity-0" : "translate-y-0 opacity-100"}`}
      />
      <Moon
        className={`absolute size-[18px] transition-all duration-500 ${isDark ? "translate-y-0 opacity-100" : "-translate-y-6 -rotate-90 opacity-0"}`}
      />
    </button>
  );
}
