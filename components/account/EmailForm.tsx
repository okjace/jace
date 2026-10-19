"use client";

import { useActionState } from "react";
import { requestEmailChangeAction } from "@/app/account/actions";

export function EmailForm({
  email,
  emailVerified,
  pendingEmail,
}: {
  email?: string;
  emailVerified: boolean;
  pendingEmail?: string;
}) {
  const [state, formAction, pending] = useActionState(requestEmailChangeAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">Email</h2>
      {email ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Current: {email} {emailVerified ? "(verified)" : "(unverified)"}
        </p>
      ) : (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">No email on file.</p>
      )}
      {pendingEmail && (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          Check your inbox — {pendingEmail} is waiting on verification.
        </p>
      )}
      <div className="flex gap-2">
        <input
          name="email"
          type="email"
          placeholder="you@example.com"
          required
          className="flex-1 rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40"
        />
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-full bg-accent px-4 text-xs font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? "Sending…" : email ? "Change" : "Add"}
        </button>
      </div>
      {state.error && <p className="text-sm text-red-500">{state.error}</p>}
      {state.success && (
        <p className="text-sm text-green-600 dark:text-green-500">{state.success}</p>
      )}
    </form>
  );
}
