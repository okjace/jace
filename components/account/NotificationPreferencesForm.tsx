"use client";

import { useActionState } from "react";
import { updateNotificationPrefsAction } from "@/app/account/actions";
import type { NotificationPrefs } from "@/lib/types";

const OPTIONS: { key: keyof NotificationPrefs; label: string; hint: string }[] = [
  { key: "calls", label: "Calls", hint: "Someone calls you in a DM or group chat" },
  { key: "messages", label: "Messages", hint: "A new direct message or group chat message" },
  { key: "videoComments", label: "Video comments", hint: "Someone comments on your video" },
  { key: "forumReplies", label: "Forum replies", hint: "Someone replies to your forum topic" },
];

export function NotificationPreferencesForm({ prefs }: { prefs: NotificationPrefs }) {
  const [state, formAction, pending] = useActionState(updateNotificationPrefsAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">Notifications</h2>
      <div className="flex flex-col gap-2">
        {OPTIONS.map((opt) => (
          <label key={opt.key} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name={opt.key}
              defaultChecked={prefs[opt.key]}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">{opt.label}</span>
              <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                {opt.hint}
              </span>
            </span>
          </label>
        ))}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="h-9 w-fit rounded-full bg-accent px-4 text-xs font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      {state.error && <p className="text-sm text-red-500">{state.error}</p>}
      {state.success && (
        <p className="text-sm text-green-600 dark:text-green-500">{state.success}</p>
      )}
    </form>
  );
}
