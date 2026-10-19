"use client";

import { useActionState } from "react";
import { changePasswordAction } from "@/app/account/actions";

export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, formAction, pending] = useActionState(changePasswordAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">Password</h2>
      {!hasPassword && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          You signed up with GitHub and don&apos;t have a password yet. Set one to
          also be able to sign in with your username and password.
        </p>
      )}

      {hasPassword && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="currentPassword" className="text-xs font-medium">
            Current password
          </label>
          <input
            id="currentPassword"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            className="rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40"
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="newPassword" className="text-xs font-medium">
          {hasPassword ? "New password" : "Password"}
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40"
        />
      </div>

      {state.error && <p className="text-sm text-red-500">{state.error}</p>}
      {state.success && (
        <p className="text-sm text-green-600 dark:text-green-500">{state.success}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="h-9 w-fit rounded-full bg-accent px-4 text-xs font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {pending ? "Saving…" : hasPassword ? "Update password" : "Set password"}
      </button>
    </form>
  );
}
