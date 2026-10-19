"use client";

import { useActionState, useState } from "react";
import { createGroupAction } from "@/app/groups/actions";

export function NewGroupForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createGroupAction, {});

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="h-9 w-fit rounded-full border border-line px-4 text-xs font-medium transition-colors hover:bg-foreground/[.05]"
      >
        New group
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-3">
      <input
        name="name"
        placeholder="Group name"
        className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
      <input
        name="usernames"
        placeholder="Members, comma separated (e.g. alice, bob)"
        className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-full bg-accent px-4 text-xs font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create group"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-9 rounded-full border border-line px-4 text-xs font-medium"
        >
          Cancel
        </button>
      </div>
      {state.error && <p className="text-sm text-red-500">{state.error}</p>}
    </form>
  );
}
