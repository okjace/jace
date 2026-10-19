"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import {
  addAccountAction,
  addAccountWithGithubAction,
  beginAddAccountAction,
  cancelAddAccountAction,
} from "@/app/account/actions";
import { EmailSignInForm } from "@/components/auth/EmailSignInForm";

const inputClass =
  "rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40";
const outlineButtonClass =
  "flex h-11 w-full items-center justify-center rounded-md border border-black/10 px-4 text-sm font-medium transition-colors hover:bg-black/[.03] dark:border-white/15 dark:hover:bg-white/[.05]";

/**
 * The account switcher's "Add account", as a popup laid out like the
 * READ ME one and offering everything the normal sign-in page does:
 * GitHub, an emailed link, username/email + password (with 2FA),
 * forgot password, and signing up a new account. Password sign-ins finish
 * right here; the rest finish on another page and are saved by
 * /account/add-complete (see afterSignInPath).
 */
export function AddAccountPopup({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<"main" | "email">("main");
  const [startError, setStartError] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(addAccountAction, {});
  // Controlled so a failed 2FA attempt doesn't wipe what was typed (same as SignInForm).
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // Save the current account and flag the browser as adding as soon as the
  // popup opens, so every way of signing in below gets saved too.
  useEffect(() => {
    beginAddAccountAction()
      .then((result) => setStartError(result.error ?? null))
      .catch(() => setStartError("Couldn't start adding an account. Try again."));
  }, []);

  // A successful sign-in changed the active session cookie, so only a real
  // navigation (not router.refresh()) will show the new account.
  useEffect(() => {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- deliberate hard nav, see comment above
    if (state.done) window.location.href = "/";
  }, [state]);

  function close() {
    onClose();
    cancelAddAccountAction().catch(() => {
      // Best-effort — the flag expires on its own.
    });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close only depends on the stable onClose
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="addAccountTitle"
        className="flex max-h-[80vh] w-full max-w-sm flex-col gap-4 overflow-hidden rounded-lg border border-black/10 bg-background p-6 shadow-xl dark:border-white/15"
      >
        <div>
          <h2 id="addAccountTitle" className="text-lg font-semibold">
            {view === "email" ? "Sign in with email" : "Add account"}
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {view === "email"
              ? "Enter the verified email address on your account and we'll send you a link to sign in — no password needed. Open it in this browser to add the account."
              : "Sign in to another account to save it in this browser."}
          </p>
        </div>

        <div className="flex flex-col gap-6 overflow-y-auto">
          {startError ? (
            <p className="text-sm text-red-500">{startError}</p>
          ) : view === "email" ? (
            <EmailSignInForm />
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <form action={addAccountWithGithubAction}>
                  <button type="submit" className={outlineButtonClass}>
                    Continue with GitHub
                  </button>
                </form>
                <button type="button" onClick={() => setView("email")} className={outlineButtonClass}>
                  Continue with email
                </button>
              </div>

              <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                <div className="h-px flex-1 bg-black/10 dark:bg-white/15" />
                or
                <div className="h-px flex-1 bg-black/10 dark:bg-white/15" />
              </div>

              <form action={formAction} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="addAccountUsername" className="text-sm font-medium">
                    Username or Email
                  </label>
                  <input
                    id="addAccountUsername"
                    name="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    autoFocus
                    required
                    className={inputClass}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="addAccountPassword" className="text-sm font-medium">
                      Password
                    </label>
                    <Link
                      href="/forgot-password"
                      className="text-xs text-zinc-500 underline underline-offset-2 dark:text-zinc-400"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <input
                    id="addAccountPassword"
                    name="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    className={inputClass}
                  />
                </div>

                {state.requiresTotp && (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="addAccountCode" className="text-sm font-medium">
                      Authenticator code
                    </label>
                    <input
                      id="addAccountCode"
                      name="code"
                      autoComplete="one-time-code"
                      maxLength={6}
                      autoFocus
                      required
                      className={inputClass}
                    />
                  </div>
                )}

                {state.error && <p className="text-sm text-red-500">{state.error}</p>}

                <button
                  type="submit"
                  disabled={pending}
                  className="mt-2 h-11 rounded-full bg-accent px-5 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
                >
                  {pending ? "Signing in…" : "Sign in"}
                </button>
              </form>

              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No account?{" "}
                <Link href="/sign-up" className="underline underline-offset-2">
                  Sign up
                </Link>
              </p>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-black/10 pt-4 dark:border-white/15">
          {view === "email" ? (
            <button
              type="button"
              onClick={() => setView("main")}
              className="text-xs text-zinc-500 underline underline-offset-2 hover:text-foreground dark:text-zinc-400"
            >
              ← Other ways to sign in
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={close}
            className="h-9 rounded-full border border-black/10 px-5 text-sm font-medium transition-colors hover:bg-black/[.03] dark:border-white/15 dark:hover:bg-white/[.05]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
