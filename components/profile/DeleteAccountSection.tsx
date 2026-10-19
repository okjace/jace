"use client";

import { useState } from "react";
import {
  deleteAccountWithPasswordAction,
  requestAccountDeletionAction,
} from "@/app/profile/[userId]/actions";

export function DeleteAccountSection({
  userId,
  hasEmail,
  hasPassword,
}: {
  userId: string;
  hasEmail: boolean;
  hasPassword: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");

  // No email on file means there's nowhere to send a confirmation link, so
  // deletion is confirmed by password (or, if there's no password either —
  // a GitHub-only account — just the confirm step below) instead.
  if (!hasEmail) {
    async function handleDelete() {
      setBusy(true);
      setError(null);
      try {
        const result = await deleteAccountWithPasswordAction(userId, password);
        if (result.error) {
          setError(result.error);
          setBusy(false);
        } else {
          // Deletion signs the session out server-side; only a real
          // navigation (not the router) will reflect that.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.href = "/";
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete account.");
        setBusy(false);
      }
    }

    return (
      <div className="flex flex-col gap-2 rounded-md border border-red-500/30 p-3">
        <p className="text-sm font-medium text-red-500">Danger zone</p>
        {confirming ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              This permanently deletes your profile, videos, projects, and
              scores. This can&apos;t be undone.
            </p>
            {hasPassword && (
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                autoComplete="current-password"
                autoFocus
                className="rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40"
              />
            )}
            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                disabled={busy || (hasPassword && !password)}
                className="h-9 rounded-full bg-red-500 px-4 text-xs font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50"
              >
                {busy ? "Deleting…" : "Delete my account"}
              </button>
              <button
                onClick={() => {
                  setConfirming(false);
                  setPassword("");
                  setError(null);
                }}
                disabled={busy}
                className="h-9 rounded-full border border-black/10 px-4 text-xs font-medium dark:border-white/15"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="w-fit rounded-full border border-red-500 px-4 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/10"
          >
            Delete account
          </button>
        )}
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    );
  }

  async function handleRequest() {
    if (
      !confirm(
        "We'll email you a link to confirm deleting your account, videos, and projects. Continue?",
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const result = await requestAccountDeletionAction(userId);
      if (result.error) {
        setError(result.error);
      } else {
        setSent(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send email.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-red-500/30 p-3">
      <p className="text-sm font-medium text-red-500">Danger zone</p>
      {sent ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Check your email for a link to confirm deleting your account.
        </p>
      ) : (
        <button
          onClick={handleRequest}
          disabled={busy}
          className="w-fit rounded-full border border-red-500 px-4 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50"
        >
          {busy ? "Sending…" : "Delete account"}
        </button>
      )}
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
