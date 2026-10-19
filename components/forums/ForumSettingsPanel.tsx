"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  deleteForumAction,
  updateForumPermissionsAction,
} from "@/app/forums/[forumId]/actions";
import type { ForumPermission } from "@/lib/types";
import { pollThenRefresh } from "@/lib/pollRefresh";

export function ForumSettingsPanel({
  forumId,
  postPermission,
  replyPermission,
  viewPermission,
}: {
  forumId: string;
  postPermission: ForumPermission;
  replyPermission: ForumPermission;
  viewPermission: ForumPermission;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (
      !confirm(
        "Delete this forum and all of its topics/replies? This can't be undone.",
      )
    )
      return;
    setDeleting(true);
    try {
      await deleteForumAction(forumId);
      router.push("/forums");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete forum.");
      setDeleting(false);
    }
  }

  return (
    <form
      action={async (formData) => {
        setSaving(true);
        setError(null);
        try {
          await updateForumPermissionsAction(forumId, formData);
          await pollThenRefresh(
            async () => true,
            () => router.refresh(),
          );
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to save settings.");
        } finally {
          setSaving(false);
        }
      }}
      className="flex flex-col gap-3 rounded-lg border border-black/10 p-4 dark:border-white/15"
    >
      <h2 className="text-sm font-semibold">Forum settings</h2>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="postPermission" className="text-xs font-medium">
          Who can create topics
        </label>
        <select
          id="postPermission"
          name="postPermission"
          defaultValue={postPermission}
          className="rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40"
        >
          <option value="everyone">Everyone</option>
          <option value="adminOnly">Only me</option>
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="replyPermission" className="text-xs font-medium">
          Who can reply
        </label>
        <select
          id="replyPermission"
          name="replyPermission"
          defaultValue={replyPermission}
          className="rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40"
        >
          <option value="everyone">Everyone</option>
          <option value="adminOnly">Only me</option>
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="viewPermission" className="text-xs font-medium">
          Who can view
        </label>
        <select
          id="viewPermission"
          name="viewPermission"
          defaultValue={viewPermission}
          className="rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40"
        >
          <option value="everyone">Everyone</option>
          <option value="adminOnly">Only me</option>
        </select>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="h-9 rounded-full bg-accent px-4 text-xs font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="h-9 rounded-full border border-red-500 px-4 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Delete forum"}
        </button>
      </div>
    </form>
  );
}
