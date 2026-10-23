"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { changeDisplayNameAction } from "@/app/account/actions";
import { MAX_DISPLAY_NAME_LENGTH } from "@/lib/format";

export function DisplayNameForm({
  displayName,
  username,
}: {
  displayName?: string;
  username: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(changeDisplayNameAction, {});

  useEffect(() => {
    if (state.success) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold">Display name</h2>
        <p className="mt-0.5 text-xs text-muted">
          The name people see on your profile. Spaces and emoji are fine, and
          it doesn&apos;t have to be unique. Leave it empty to show your
          username ({username}).
        </p>
      </div>
      <div className="flex gap-2">
        <input
          name="displayName"
          defaultValue={displayName ?? ""}
          maxLength={MAX_DISPLAY_NAME_LENGTH * 2}
          placeholder={username}
          className="flex-1 rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-full bg-accent px-4 text-xs font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {state.error && <p className="text-sm text-red-500">{state.error}</p>}
      {state.success && (
        <p className="text-sm text-green-600 dark:text-green-500">{state.success}</p>
      )}
    </form>
  );
}
