"use client";

import { useActionState } from "react";
import { addGroupMemberAction } from "@/app/groups/actions";

export function AddMemberForm({ groupId }: { groupId: string }) {
  const [state, formAction, pending] = useActionState(
    addGroupMemberAction.bind(null, groupId),
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          name="username"
          placeholder="Add member by username"
          className="flex-1 rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40"
        />
        <button
          type="submit"
          disabled={pending}
          className="h-9 shrink-0 rounded-full border border-black/10 px-4 text-xs font-medium transition-colors hover:bg-black/[.03] disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/[.05]"
        >
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
      {state.error && <p className="text-sm text-red-500">{state.error}</p>}
    </form>
  );
}
