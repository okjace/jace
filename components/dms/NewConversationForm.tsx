"use client";

import { useActionState } from "react";
import { startConversationAction } from "@/app/dms/actions";

export function NewConversationForm({ asOrgId }: { asOrgId?: string }) {
  const [state, formAction, pending] = useActionState(startConversationAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-2">
      {asOrgId && <input type="hidden" name="asOrgId" value={asOrgId} />}
      <div className="flex gap-2">
        <input
          name="username"
          placeholder="Username"
          className="flex-1 rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40"
        />
        <button
          type="submit"
          disabled={pending}
          className="h-9 shrink-0 rounded-full bg-accent px-4 text-xs font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? "Starting…" : "Message"}
        </button>
      </div>
      {state.error && <p className="text-sm text-red-500">{state.error}</p>}
    </form>
  );
}
