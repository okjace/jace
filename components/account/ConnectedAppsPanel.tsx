"use client";

import { useState, useTransition } from "react";
import { disconnectAppAction } from "@/app/account/actions";
import type { OAuthGrant } from "@/lib/types";

/** Apps this account signed into via "Sign in with Jace" (see app/oauth/authorize). */
export function ConnectedAppsPanel({ grants }: { grants: OAuthGrant[] }) {
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const visible = grants.filter((g) => !removed.has(g.clientId));

  function disconnect(clientId: string) {
    setPendingId(clientId);
    startTransition(async () => {
      await disconnectAppAction(clientId);
      setRemoved((prev) => new Set(prev).add(clientId));
      setPendingId(null);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold">Connected apps</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Other websites you&apos;ve signed into with &quot;Sign in with Jace.&quot;
          Disconnecting one signs it out and stops it from reading your Jace
          profile.
        </p>
      </div>
      {visible.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No connected apps.</p>
      ) : (
        <div className="flex flex-col divide-y divide-black/10 dark:divide-white/15">
          {visible.map((g) => (
            <div key={g.clientId} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{g.clientName}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Access: {g.scope.replace(" ", ", ")}
                </p>
              </div>
              <button
                onClick={() => disconnect(g.clientId)}
                disabled={isPending}
                className="h-8 shrink-0 rounded-full border border-red-500 px-3 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50"
              >
                {isPending && pendingId === g.clientId ? "Disconnecting…" : "Disconnect"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
