"use client";

import { useActionState } from "react";
import { requestEmailSignInAction } from "@/app/sign-in/email/actions";

export function EmailSignInForm() {
  const [state, formAction, pending] = useActionState(requestEmailSignInAction, {});

  if (state.success) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        If an account with that email exists, we sent a sign-in link to it.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-2 h-11 rounded-full bg-accent px-5 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send sign-in link"}
      </button>
    </form>
  );
}
