"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteCloudFileAction } from "@/app/cloud/actions";

export function DeleteFileButton({ fileId }: { fileId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this file?")) return;
    setBusy(true);
    try {
      await deleteCloudFileAction(fileId);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={busy}
      className="text-xs font-medium text-red-500 transition-colors hover:underline disabled:opacity-50"
    >
      {busy ? "Deleting…" : "Delete"}
    </button>
  );
}
