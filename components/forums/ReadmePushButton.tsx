"use client";

import { useState } from "react";
import { pushReadmeToEveryoneAction } from "@/app/forums/actions";

/** Admin-only: re-shows the READ ME popup to every account, with everything currently in the forum. */
export function ReadmePushButton() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    if (
      !confirm(
        "Show the READ ME popup to everyone again, with everything currently in this forum? This resets it for every account, including ones that already dismissed it.",
      )
    )
      return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await pushReadmeToEveryoneAction();
      setMessage(result.error ?? "Pushed — everyone will see it again within a few seconds.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to push.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="h-9 w-fit rounded-full border border-black/10 px-4 text-xs font-medium transition-colors hover:bg-black/[.03] disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/[.05]"
      >
        {busy ? "Pushing…" : "Push to everyone again"}
      </button>
      {message && <p className="text-xs text-zinc-500 dark:text-zinc-400">{message}</p>}
    </div>
  );
}
