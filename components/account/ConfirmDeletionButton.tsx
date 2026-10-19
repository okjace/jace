"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { confirmAccountDeletionAction } from "@/app/delete-account/[token]/actions";

export function ConfirmDeletionButton({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    try {
      const result = await confirmAccountDeletionAction(token);
      if (result.error) {
        setError(result.error);
      } else {
        setDone(true);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Your account has been permanently deleted.
        </p>
        <Link href="/" className="text-sm underline underline-offset-2">
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={handleConfirm}
        disabled={busy}
        className="h-11 w-fit rounded-full bg-red-500 px-6 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50"
      >
        {busy ? "Deleting…" : "Permanently delete my account"}
      </button>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
