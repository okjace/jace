"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { addAdminAction, removeAdminAction } from "@/app/account/actions";
import { Avatar } from "@/components/Avatar";
import type { PublicUser } from "@/lib/types";

export function AdminSettingsPanel({ admins }: { admins: PublicUser[] }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(addAdminAction, {});
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function handleRemove(userId: string) {
    setRemovingId(userId);
    try {
      await removeAdminAction(userId);
      router.refresh();
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold">Admins</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Admins can edit or delete any video or project, and moderate any
          comment, issue, or forum reply. Only you can grant or revoke this.
        </p>
      </div>

      {admins.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No other admins yet.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {admins.map((admin) => (
            <div key={admin.id} className="flex items-center gap-3">
              <Avatar name={admin.username} imageUrl={admin.imageUrl} size={28} />
              <span className="flex-1 text-sm font-medium">{admin.username}</span>
              <button
                onClick={() => handleRemove(admin.id)}
                disabled={removingId === admin.id}
                className="text-xs text-red-500 underline underline-offset-2 disabled:opacity-50"
              >
                {removingId === admin.id ? "Removing…" : "Remove admin"}
              </button>
            </div>
          ))}
        </div>
      )}

      <form action={formAction} className="flex gap-2">
        <input
          name="username"
          placeholder="Username"
          maxLength={20}
          className="flex-1 rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40"
        />
        <button
          type="submit"
          disabled={pending}
          className="h-9 shrink-0 rounded-full bg-accent px-4 text-xs font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add admin"}
        </button>
      </form>

      {state.error && <p className="text-sm text-red-500">{state.error}</p>}
      {state.success && <p className="text-sm text-green-600 dark:text-green-400">{state.success}</p>}
    </div>
  );
}
