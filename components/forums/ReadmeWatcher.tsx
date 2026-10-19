"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const POLL_MS = 5000;

function sameIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

/**
 * The layout only computes unseen READ ME topics on a fresh page load — a
 * session that stays on client-side navigation the whole time (or one an
 * admin just pushed the popup to via `pushReadmeToEveryoneAction`) would
 * otherwise never see it appear. This polls for a change and refreshes the
 * page's server data when one shows up, the same way `ModerationWatcher`
 * does for ban/mute state.
 */
export function ReadmeWatcher({ unseenIds }: { unseenIds: string[] }) {
  const router = useRouter();
  // A stable string key so the effect only resets when the ids actually
  // change, not on every render (the array itself is a fresh reference each
  // time the server re-renders the layout).
  const unseenKey = unseenIds.join(",");

  useEffect(() => {
    const current = unseenKey ? unseenKey.split(",") : [];
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/readme", { cache: "no-store" });
        if (!res.ok) return;
        const { ids } = (await res.json()) as { ids: string[] };
        if (!sameIds(ids, current)) router.refresh();
      } catch {
        // Try again next tick.
      }
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [unseenKey, router]);

  return null;
}
