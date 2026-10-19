"use client";

import { useEffect } from "react";
import type { ThemePreference } from "@/lib/types";

/**
 * Keeps <html data-theme> set to the resolved "light"/"dark" so users' custom
 * CSS can target it — including when the preference is "system" and the
 * device switches. The `dark:` variant itself only needs data-theme-pref
 * (see app/globals.css); the inline script in the root layout sets the first
 * value before paint.
 */
export function ThemeSync({ pref }: { pref: ThemePreference }) {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = pref === "dark" || (pref === "system" && media.matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
    };
    apply();
    if (pref !== "system") return;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [pref]);
  return null;
}
