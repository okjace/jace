"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import {
  confirmTotpEnrollmentAction,
  disableTotpAction,
  startTotpEnrollmentAction,
} from "@/app/account/actions";
import { pollThenRefresh } from "@/lib/pollRefresh";

export function TotpSection({ totpEnabled }: { totpEnabled: boolean }) {
  const router = useRouter();
  const [enrollment, setEnrollment] = useState<{
    secret: string;
    qrDataUrl: string;
  } | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [confirmState, confirmAction, confirmPending] = useActionState(
    confirmTotpEnrollmentAction,
    {},
  );

  useEffect(() => {
    if (confirmState.success) {
      setEnrollment(null);
      pollThenRefresh(
        async () => true,
        () => router.refresh(),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmState.success]);

  async function handleStart() {
    setStarting(true);
    setStartError(null);
    try {
      const result = await startTotpEnrollmentAction();
      setEnrollment(result);
    } catch (err) {
      setStartError(
        err instanceof Error ? err.message : "Failed to start enrollment.",
      );
    } finally {
      setStarting(false);
    }
  }

  async function handleDisable() {
    if (!confirm("Disable two-factor authentication?")) return;
    setDisabling(true);
    try {
      await disableTotpAction();
      await pollThenRefresh(
        async () => true,
        () => router.refresh(),
      );
    } finally {
      setDisabling(false);
    }
  }

  if (totpEnabled) {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Authenticator app</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Two-factor authentication is enabled.
        </p>
        <button
          onClick={handleDisable}
          disabled={disabling}
          className="h-9 w-fit rounded-full border border-red-500 px-4 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50"
        >
          {disabling ? "Disabling…" : "Disable 2FA"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">Authenticator app</h2>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Add an extra step at sign-in using an app like Google Authenticator or
        Authy.
      </p>

      {!enrollment ? (
        <button
          onClick={handleStart}
          disabled={starting}
          className="h-9 w-fit rounded-full border border-black/10 px-4 text-xs font-medium transition-colors hover:bg-black/[.03] disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/[.05]"
        >
          {starting ? "Starting…" : "Enable 2FA"}
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={enrollment.qrDataUrl}
            alt="Scan this QR code with your authenticator app"
            className="h-40 w-40 rounded-md bg-white p-2"
          />
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Scan with your authenticator app, or enter this key manually:{" "}
            <code className="break-all">{enrollment.secret}</code>
          </p>
          <form action={confirmAction} className="flex gap-2">
            <input
              name="code"
              placeholder="6-digit code"
              maxLength={6}
              required
              className="w-32 rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40"
            />
            <button
              type="submit"
              disabled={confirmPending}
              className="h-9 rounded-full bg-accent px-4 text-xs font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {confirmPending ? "Confirming…" : "Confirm"}
            </button>
          </form>
        </div>
      )}

      {startError && <p className="text-sm text-red-500">{startError}</p>}
      {confirmState.error && <p className="text-sm text-red-500">{confirmState.error}</p>}
      {confirmState.success && (
        <p className="text-sm text-green-600 dark:text-green-500">
          {confirmState.success}
        </p>
      )}
    </div>
  );
}
