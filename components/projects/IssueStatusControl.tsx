"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  deleteIssueAction,
  setIssueStatusAction,
} from "@/app/projects/[projectId]/actions";
import type { IssueStatus } from "@/lib/types";

export function IssueStatusControl({
  projectId,
  issueId,
  status,
}: {
  projectId: string;
  issueId: string;
  status: IssueStatus;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleStatus() {
    setBusy(true);
    setError(null);
    try {
      await setIssueStatusAction(
        projectId,
        issueId,
        status === "open" ? "closed" : "open",
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update issue.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this issue? This can't be undone.")) return;
    setBusy(true);
    setError(null);
    try {
      await deleteIssueAction(projectId, issueId);
      router.push(`/projects/${projectId}/issues`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete issue.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <button
          onClick={toggleStatus}
          disabled={busy}
          className="h-9 w-fit rounded-full border border-line px-4 text-xs font-medium transition-colors hover:bg-black/[.03] disabled:opacity-50 dark:hover:bg-white/[.05]"
        >
          {status === "open" ? "Close issue" : "Reopen issue"}
        </button>
        <button
          onClick={handleDelete}
          disabled={busy}
          className="h-9 w-fit rounded-full text-xs font-medium text-red-500 underline underline-offset-2 disabled:opacity-50"
        >
          Delete
        </button>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
