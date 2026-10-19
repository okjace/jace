"use client";

import { useState } from "react";
import { confirmVerificationAction } from "@/app/verify-email/[token]/actions";

export function ConfirmVerificationButton({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [confirmedEmail, setConfirmedEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    try {
      const result = await confirmVerificationAction(token);
      if (result.error) {
        setError(result.error);
      } else if (result.confirmedEmail) {
        setConfirmedEmail(result.confirmedEmail);
      }
    } finally {
      setBusy(false);
    }
  }

  if (confirmedEmail) {
    return (
      <>
        <h1 className="text-xl font-semibold">Email verified</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {confirmedEmail} is now confirmed on your account.
        </p>
      </>
    );
  }

  if (error) {
    return (
      <>
        <h1 className="text-xl font-semibold">Link expired</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{error}</p>
      </>
    );
  }

  return (
    <>
      <h1 className="text-xl font-semibold">Confirm your email</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Click below to confirm this address on your Jace account.
      </p>
      <button
        onClick={handleConfirm}
        disabled={busy}
        className="h-11 w-fit rounded-full bg-accent px-6 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {busy ? "Confirming…" : "Confirm email"}
      </button>
    </>
  );
}
