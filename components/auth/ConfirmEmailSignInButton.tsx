"use client";

import { useActionState } from "react";
import { confirmEmailSignInAction } from "@/app/sign-in/email/actions";

export function ConfirmEmailSignInButton({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(
    confirmEmailSignInAction.bind(null, token),
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.requiresTotp && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="code" className="text-sm font-medium">
            Authenticator code
          </label>
          <input
            id="code"
            name="code"
            autoComplete="one-time-code"
            maxLength={6}
            autoFocus
            required
            className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </div>
      )}

      {state.error && <p className="text-sm text-red-500">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="h-11 w-fit rounded-full bg-accent px-6 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
