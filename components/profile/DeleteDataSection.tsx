"use client";

import { useState } from "react";
import { deleteMyDataAction } from "@/app/profile/[userId]/actions";

const CATEGORIES: { id: string; label: string; detail: string }[] = [
  { id: "videos", label: "Videos", detail: "Every video you uploaded, with its thumbnail, likes, and comments." },
  { id: "projects", label: "Projects", detail: "Every project you own, with its files, versions, and issues." },
  { id: "forum", label: "Forum posts", detail: "Topics you started (with everyone's replies in them) and replies you wrote." },
  { id: "comments", label: "Comments & issues", detail: "Your comments on videos and projects, and issues you opened." },
  { id: "chat", label: "Live chat messages", detail: "Everything you posted in the public chat." },
  { id: "messages", label: "Messages you sent", detail: "Direct and group messages you sent. They disappear for the other people too." },
  { id: "cloud", label: "Cloud files", detail: "Every file in your private Cloud." },
  { id: "scores", label: "Game scores", detail: "Your leaderboard entries." },
  { id: "activity", label: "Likes, follows & notifications", detail: "Videos you liked, who you follow and who follows you, and your notifications." },
  { id: "profile", label: "Profile info", detail: "Bio, website, social links, avatar, banner, and video upload defaults." },
];

export function DeleteDataSection({ userId }: { userId: string }) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});

  async function run(id: string) {
    setBusy(id);
    try {
      const r = await deleteMyDataAction(userId, id);
      setResults((prev) => ({
        ...prev,
        [id]: r.error ?? (r.count ? `Deleted ${r.count}.` : "Nothing to delete."),
      }));
    } catch (err) {
      setResults((prev) => ({
        ...prev,
        [id]: err instanceof Error ? err.message : "Failed to delete.",
      }));
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
      <div>
        <h2 className="text-sm font-semibold">Your data</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Delete any data you want at any time in your settings. This keeps your
          account; each deletion is permanent.
        </p>
      </div>
      <div className="flex flex-col divide-y divide-black/10 dark:divide-white/15">
        {CATEGORIES.map((c) => (
          <div key={c.id} className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{c.label}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{c.detail}</p>
              {results[c.id] && (
                <p className="mt-0.5 text-xs text-green-600 dark:text-green-500">{results[c.id]}</p>
              )}
            </div>
            {confirming === c.id ? (
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => run(c.id)}
                  disabled={busy !== null}
                  className="h-8 rounded-full bg-red-500 px-3 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-50"
                >
                  {busy === c.id ? "Deleting…" : "Yes, delete"}
                </button>
                <button
                  onClick={() => setConfirming(null)}
                  disabled={busy !== null}
                  className="h-8 rounded-full border border-black/10 px-3 text-xs font-medium dark:border-white/15"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setConfirming(c.id);
                  setResults((prev) => ({ ...prev, [c.id]: "" }));
                }}
                disabled={busy !== null}
                className="h-8 shrink-0 rounded-full border border-red-500 px-3 text-xs font-medium text-red-500 hover:bg-red-500/10 disabled:opacity-50"
              >
                Delete
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
