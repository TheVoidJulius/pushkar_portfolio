"use client";

import { useServerInsertedHTML } from "next/navigation";
import { useLayoutEffect, useRef } from "react";

// Stored choice → system preference. Runs before first paint (no flash).
const resolve = `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',t)}catch(e){document.documentElement.setAttribute('data-theme','light')}})()`;

export function ThemeScript() {
  const inserted = useRef(false);
  useServerInsertedHTML(() => {
    if (inserted.current) return null;
    inserted.current = true;
    return <script dangerouslySetInnerHTML={{ __html: resolve }} />;
  });

  // React's dev-mode remount clears attributes on <html>; re-apply before paint.
  useLayoutEffect(() => {
    let t: string | null = null;
    try {
      t = localStorage.getItem("theme");
    } catch {
      /* storage blocked */
    }
    if (t !== "light" && t !== "dark") t = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", t);
  }, []);

  return null;
}
