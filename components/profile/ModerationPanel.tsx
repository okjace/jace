"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  banUserAction,
  muteUserAction,
  unbanUserAction,
  unmuteUserAction,
} from "@/app/profile/[userId]/actions";
import type { ModerationStatus } from "@/lib/types";

export function ModerationPanel({
  userId,
  status,
}: {
  userId: string;
  status: ModerationStatus;
}) {
  const router = useRouter();
  const [banReason, setBanReason] = useState("");
  const [muteReason, setMuteReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-red-500/30 p-4">
      <h2 className="text-sm font-semibold">Moderation</h2>

      <div className="flex flex-col gap-2">
        {status.banned ? (
          <>
            <p className="text-sm text-red-500">
              Banned{status.banReason ? `: ${status.banReason}` : "."}
            </p>
            <button
              onClick={() => run(() => unbanUserAction(userId))}
              disabled={busy}
              className="h-9 w-fit rounded-full border border-line px-4 text-xs font-medium disabled:opacity-50"
            >
              {busy ? "Working…" : "Unban"}
            </button>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(() => banUserAction(userId, banReason)).then(() => setBanReason(""));
            }}
            className="flex flex-col gap-2"
          >
            <label htmlFor="banReason" className="text-xs font-medium">
              Ban reason
            </label>
            <input
              id="banReason"
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder="Why are you banning this account?"
              maxLength={500}
              className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
            <button
              type="submit"
              disabled={busy || !banReason.trim()}
              className="h-9 w-fit rounded-full bg-red-500 px-4 text-xs font-medium text-white disabled:opacity-50"
            >
              {busy ? "Working…" : "Ban"}
            </button>
          </form>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-line pt-4">
        {status.muted ? (
          <>
            <p className="text-sm text-amber-600 dark:text-amber-500">
              Muted{status.muteReason ? `: ${status.muteReason}` : "."}
            </p>
            <button
              onClick={() => run(() => unmuteUserAction(userId))}
              disabled={busy}
              className="h-9 w-fit rounded-full border border-line px-4 text-xs font-medium disabled:opacity-50"
            >
              {busy ? "Working…" : "Unmute"}
            </button>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(() => muteUserAction(userId, muteReason)).then(() => setMuteReason(""));
            }}
            className="flex flex-col gap-2"
          >
            <label htmlFor="muteReason" className="text-xs font-medium">
              Mute reason
            </label>
            <input
              id="muteReason"
              value={muteReason}
              onChange={(e) => setMuteReason(e.target.value)}
              placeholder="Why are you muting this account?"
              maxLength={500}
              className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
            <button
              type="submit"
              disabled={busy || !muteReason.trim()}
              className="h-9 w-fit rounded-full border border-line px-4 text-xs font-medium disabled:opacity-50"
            >
              {busy ? "Working…" : "Mute"}
            </button>
          </form>
        )}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
