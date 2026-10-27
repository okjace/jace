"use client";

import Link from "next/link";
import { useActionState } from "react";
import { saveAutomodSettingsAction } from "@/app/account/automodActions";

export type AutomodPanelSettings = {
  enabled: boolean;
  blockedTerms: string[];
  maxLinks: number;
  autoMuteAfter: number;
  autoMuteMinutes: number;
};

export type AutomodPanelLogEntry = {
  id: string;
  userId: string;
  username?: string;
  area: string;
  matched: string;
  excerpt: string;
  createdAt: string;
};

const INPUT =
  "rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

/** Auto-moderation settings and what it has blocked lately. Jace admins only (see lib/automod.ts). */
export function AutomodPanel({
  settings,
  log,
}: {
  settings: AutomodPanelSettings;
  log: AutomodPanelLogEntry[];
}) {
  const [state, formAction, pending] = useActionState(saveAutomodSettingsAction, {});

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-semibold">Auto moderation</h2>
          <p className="mt-0.5 text-xs text-muted">
            Checks what people write before it&apos;s saved: profiles, display names and usernames,
            forum posts, project comments and issues, and messages and video comments sent through
            Jace&apos;s apps. Blocked posts aren&apos;t saved, and the person sees why.
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="enabled" defaultChecked={settings.enabled} />
          Auto moderation is on
        </label>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="blockedTerms" className="text-xs font-medium">
            Blocked words and phrases (one per line)
          </label>
          <textarea
            id="blockedTerms"
            name="blockedTerms"
            defaultValue={settings.blockedTerms.join("\n")}
            rows={8}
            spellCheck={false}
            placeholder={"one word or phrase per line"}
            className={`${INPUT} font-mono text-xs`}
          />
          <p className="text-xs text-muted">
            Matched as whole words, ignoring capitals and accents, and also when disguised with
            numbers or symbols (b4d), spaced out (b a d), or stretched (baaad). &quot;bad&quot;
            doesn&apos;t block &quot;badge&quot;.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="maxLinks" className="text-xs font-medium">Links per post</label>
            <input id="maxLinks" name="maxLinks" type="number" min={0} max={50} defaultValue={settings.maxLinks} className={INPUT} />
            <p className="text-xs text-muted">0 = no limit</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="autoMuteAfter" className="text-xs font-medium">Auto-mute after</label>
            <input id="autoMuteAfter" name="autoMuteAfter" type="number" min={0} max={100} defaultValue={settings.autoMuteAfter} className={INPUT} />
            <p className="text-xs text-muted">blocked posts in 24 hours (0 = never)</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="autoMuteHours" className="text-xs font-medium">Auto-mute for</label>
            <input
              id="autoMuteHours"
              name="autoMuteHours"
              type="number"
              min={0}
              max={8760}
              defaultValue={Math.round(settings.autoMuteMinutes / 60)}
              className={INPUT}
            />
            <p className="text-xs text-muted">hours (0 = permanent). Admins are never auto-muted.</p>
          </div>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="h-9 w-fit rounded-full bg-accent px-4 text-xs font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {state.error && <p className="text-sm text-red-500">{state.error}</p>}
        {state.success && <p className="text-sm text-green-600 dark:text-green-500">{state.success}</p>}
      </form>

      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <h3 className="text-sm font-semibold">Recently blocked</h3>
        {log.length === 0 ? (
          <p className="text-sm text-muted">Nothing blocked yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line text-sm">
            {log.map((entry) => (
              <li key={entry.id} className="flex flex-col gap-0.5 py-2">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <Link href={`/profile/${entry.userId}`} className="font-medium underline underline-offset-2">
                    {entry.username ?? entry.userId}
                  </Link>
                  <span className="text-muted">in {entry.area}</span>
                  <span className="text-red-500">({entry.matched})</span>
                  <span className="ml-auto text-xs text-muted">{new Date(entry.createdAt).toLocaleString()}</span>
                </div>
                <p className="line-clamp-2 break-words text-xs text-muted">{entry.excerpt}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
