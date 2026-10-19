"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useActionState, useEffect, useRef } from "react";
import { changeUsernameAction } from "@/app/account/actions";

export function UsernameForm({ username }: { username: string }) {
  const { update } = useSession();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, formAction, pending] = useActionState(changeUsernameAction, {});

  useEffect(() => {
    if (state.success && inputRef.current) {
      update({ name: inputRef.current.value }).then(() => router.refresh());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">Username</h2>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          name="username"
          defaultValue={username}
          maxLength={20}
          required
          className="flex-1 rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40"
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
