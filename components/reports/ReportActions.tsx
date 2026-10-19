"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { resolveReportAction } from "@/app/reports/actions";

export function ReportActions({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(status: "resolved" | "dismissed") {
    setBusy(true);
    try {
      await resolveReportAction(reportId, status, note);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional)"
        maxLength={500}
        className="min-w-48 flex-1 rounded-md border border-black/10 bg-transparent px-2 py-1 text-sm dark:border-white/15"
      />
      <button
        onClick={() => run("resolved")}
        disabled={busy}
        className="h-8 rounded-full bg-accent px-3 text-xs font-medium text-on-accent disabled:opacity-50"
      >
        Resolve
      </button>
      <button
        onClick={() => run("dismissed")}
        disabled={busy}
        className="h-8 rounded-full border border-black/10 px-3 text-xs font-medium disabled:opacity-50 dark:border-white/15"
      >
        Dismiss
      </button>
    </div>
  );
}
