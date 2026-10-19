"use client";

import { useState, useTransition } from "react";
import { signOut as clientSignOut } from "next-auth/react";
import {
  removeSavedAccountAction,
  switchAccountAction,
} from "@/app/account/actions";
import { Avatar } from "@/components/Avatar";
import { AddAccountPopup } from "@/components/account/AddAccountPopup";

export type SwitcherAccount = {
  id: string;
  username: string;
  imageUrl?: string;
};

const MAX_SAVED_ACCOUNTS = 6;

export function AccountSwitcher({
  current,
  savedAccounts,
}: {
  current: SwitcherAccount;
  /** Every other account saved in this browser (current is shown separately). */
  savedAccounts: SwitcherAccount[];
}) {
  const [adding, setAdding] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Switching or removing changes which session cookie is active, and
  // `router.refresh()` re-renders using the request that's already in
  // flight (still carrying the *old* cookie) — only a real navigation picks
  // up the new one, so these use `window.location` instead of the router.
  function switchTo(id: string) {
    setPendingId(id);
    startTransition(async () => {
      try {
        await switchAccountAction(id);
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- deliberate hard nav, see comment above
        window.location.href = "/";
      } catch {
        setPendingId(null);
      }
    });
  }

  function remove(id: string) {
    setPendingId(id);
    startTransition(async () => {
      try {
        const { removedCurrent } = await removeSavedAccountAction(id);
        window.location.href = removedCurrent ? "/sign-in" : window.location.pathname;
      } catch {
        setPendingId(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">Accounts</h2>

      <div className="flex items-center gap-3 rounded-md border border-line px-3 py-2">
        <Avatar name={current.username} imageUrl={current.imageUrl} size={28} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{current.username}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Current</p>
        </div>
        <button
          type="button"
          onClick={() => clientSignOut({ callbackUrl: "/" })}
          className="text-xs font-medium text-zinc-500 underline underline-offset-2 hover:text-foreground dark:text-zinc-400"
        >
          Sign out
        </button>
      </div>

      {savedAccounts.map((account) => (
        <div
          key={account.id}
          className="flex items-center gap-3 rounded-md border border-line px-3 py-2"
        >
          <Avatar name={account.username} imageUrl={account.imageUrl} size={28} />
          <p className="min-w-0 flex-1 truncate text-sm font-medium">{account.username}</p>
          <button
            type="button"
            onClick={() => switchTo(account.id)}
            disabled={isPending}
            className="h-8 rounded-full border border-line px-3 text-xs font-medium transition-colors hover:bg-black/[.03] disabled:opacity-50 dark:hover:bg-white/[.05]"
          >
            {isPending && pendingId === account.id ? "Switching…" : "Switch"}
          </button>
          <button
            type="button"
            onClick={() => remove(account.id)}
            disabled={isPending}
            title="Remove from this browser"
            aria-label={`Remove ${account.username} from this browser`}
            className="text-red-500 transition-opacity hover:opacity-70 disabled:opacity-50"
          >
            <TrashIcon />
          </button>
        </div>
      ))}

      {savedAccounts.length < MAX_SAVED_ACCOUNTS && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="w-fit text-xs font-medium underline underline-offset-2"
        >
          + Add account
        </button>
      )}

      {adding && <AddAccountPopup onClose={() => setAdding(false)} />}
    </div>
  );
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="h-4 w-4"
      aria-hidden
    >
      <path
        d="M4 6h12M8 6V4.5A1.5 1.5 0 0 1 9.5 3h1A1.5 1.5 0 0 1 12 4.5V6m-6.5 0 .6 9.4A1.5 1.5 0 0 0 7.6 17h4.8a1.5 1.5 0 0 0 1.5-1.6L14.5 6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
