"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const POLL_MS = 3000;

/** Refreshes the page as soon as the user's ban/mute state changes, so it applies without a manual reload. */
export function ModerationWatcher({ banned, muted }: { banned: boolean; muted: boolean }) {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/moderation", { cache: "no-store" });
        if (!res.ok) return;
        const now = (await res.json()) as { banned: boolean; muted: boolean };
        if (now.banned !== banned || now.muted !== muted) router.refresh();
      } catch {
        // Try again next tick.
      }
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [banned, muted, router]);

  return null;
}
