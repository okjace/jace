"use client";

import { useState } from "react";
import { leaveGroupAction } from "@/app/groups/actions";

export function LeaveGroupButton({ groupId }: { groupId: string }) {
  const [busy, setBusy] = useState(false);

  async function handleLeave() {
    if (!confirm("Leave this group chat?")) return;
    setBusy(true);
    await leaveGroupAction(groupId);
  }

  return (
    <button
      onClick={handleLeave}
      disabled={busy}
      className="h-9 w-fit rounded-full border border-red-500 px-4 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50"
    >
      {busy ? "Leaving…" : "Leave group"}
    </button>
  );
}
