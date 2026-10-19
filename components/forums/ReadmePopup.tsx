"use client";

import Link from "next/link";
import { useState } from "react";
import { markReadmeSeenAction } from "@/app/forums/actions";
import { MarkdownContent } from "@/components/forums/MarkdownContent";
import { README_FORUM_ID } from "@/lib/constants";
import { DeleteAccountSection } from "@/components/profile/DeleteAccountSection";
import { DeleteDataSection } from "@/components/profile/DeleteDataSection";

export type ReadmeTopic = {
  id: string;
  title: string;
  body: string;
};

export function ReadmePopup({
  topics,
  sawBefore,
  account,
  signedOutSeenMs,
}: {
  /** Newest first. Everything, for an account that's never dismissed this; just what's new otherwise. */
  topics: ReadmeTopic[];
  /** Whether this account has dismissed the popup before — changes the heading/copy. */
  sawBefore: boolean;
  /** The signed-in account, so the popup can offer deleting it or its data instead of just accepting. Absent when signed out. */
  account?: { userId: string; hasEmail: boolean; hasPassword: boolean };
  /** Signed out only: the newest topic's time (ms), remembered in a cookie on dismiss so the popup stays away until something newer is posted. */
  signedOutSeenMs?: number;
}) {
  const [open, setOpen] = useState(true);
  const [showDelete, setShowDelete] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  if (!open || topics.length === 0) return null;

  async function dismiss() {
    setDismissing(true);
    setOpen(false);
    if (!account) {
      // No account to record it on — remember in a cookie instead (see the
      // signed-out branch in app/layout.tsx, which reads it).
      document.cookie = `readme_seen=${signedOutSeenMs ?? Date.now()}; path=/; max-age=31536000; samesite=lax`;
      return;
    }
    try {
      await markReadmeSeenAction();
    } catch {
      // Best-effort — worst case it shows again next visit.
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col gap-4 overflow-hidden rounded-lg border border-line bg-background p-6 shadow-xl">
        <div>
          <h2 className="text-lg font-semibold">
            {sawBefore ? "READ ME was updated" : "Before you get started"}
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {sawBefore
              ? "Here's what's new since you last saw this."
              : "Please read this before using Jace."}
          </p>
        </div>

        <div className="flex flex-col gap-5 overflow-y-auto">
          {topics.map((topic) => (
            <div key={topic.id} className="flex flex-col gap-1.5">
              <h3 className="font-semibold">{topic.title}</h3>
              <MarkdownContent>{topic.body}</MarkdownContent>
            </div>
          ))}

          {account && (
          <div className="flex flex-col gap-3 border-t border-line pt-4">
            <button
              type="button"
              onClick={() => setShowDelete((v) => !v)}
              className="w-fit text-xs text-zinc-500 underline underline-offset-2 hover:text-foreground dark:text-zinc-400"
            >
              {showDelete ? "Hide options" : "Don't want to use Jace? Delete your account or data instead"}
            </button>
            {showDelete && (
              <>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  You don&apos;t have to click &quot;Got it&quot; to do this — delete whatever
                  you like, or your whole account, right here.
                </p>
                <DeleteDataSection userId={account.userId} />
                <DeleteAccountSection
                  userId={account.userId}
                  hasEmail={account.hasEmail}
                  hasPassword={account.hasPassword}
                />
              </>
            )}
          </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
          <Link
            href={`/forums/${README_FORUM_ID}`}
            onClick={dismiss}
            className="text-xs text-zinc-500 underline underline-offset-2 hover:text-foreground dark:text-zinc-400"
          >
            View in forum
          </Link>
          <button
            type="button"
            onClick={dismiss}
            disabled={dismissing}
            className="h-9 rounded-full bg-accent px-5 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
