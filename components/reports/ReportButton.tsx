"use client";

import { useState } from "react";
import { createReportAction } from "@/app/reports/actions";
import type { ReportReason, ReportTargetType } from "@/lib/types";

const REASONS: { value: ReportReason; label: string }[] = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment or abuse" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "other", label: "Something else" },
];

export function ReportButton({
  targetType,
  targetId,
  label = "Report",
}: {
  targetType: ReportTargetType;
  targetId: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>("spam");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [website, setWebsite] = useState("");

  if (done) {
    return <span className="text-xs text-zinc-500 dark:text-zinc-400">Reported — thanks</span>;
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await createReportAction(targetType, targetId, reason, details, website);
    setBusy(false);
    if (res.error) setError(res.error);
    else setDone(true);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-zinc-500 underline underline-offset-2 hover:text-foreground dark:text-zinc-400"
      >
        {label}
      </button>
    );
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-2 rounded-md border border-line p-3 text-sm">
      <span className="text-xs font-medium">Why are you reporting this?</span>
      <select
        value={reason}
        onChange={(e) => setReason(e.target.value as ReportReason)}
        className="rounded-lg border border-line bg-background px-2 py-1 text-sm dark:bg-background"
      >
        {REASONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      <textarea
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder={reason === "other" ? "Describe the problem" : "Add details (optional)"}
        className="rounded-lg border border-line bg-background px-2 py-1 text-sm outline-none"
      />
      <input
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute left-[-9999px] h-0 w-0 opacity-0"
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={busy}
          className="h-8 rounded-full bg-accent px-3 text-xs font-medium text-on-accent disabled:opacity-50"
        >
          {busy ? "Sending…" : "Send report"}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="h-8 rounded-full border border-line px-3 text-xs font-medium"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
