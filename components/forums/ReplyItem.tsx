"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  deleteReplyAction,
  updateReplyAction,
} from "@/app/forums/[forumId]/[topicId]/actions";
import { Avatar } from "@/components/Avatar";
import { AttachmentPreview } from "@/components/AttachmentPreview";
import { ReportButton } from "@/components/reports/ReportButton";
import { MarkdownContent } from "@/components/forums/MarkdownContent";
import type { Attachment } from "@/lib/types";

export function ReplyItem({
  forumId,
  topicId,
  replyId,
  authorId,
  authorType,
  authorName,
  authorImageUrl,
  body,
  attachment,
  canManage,
  canReport = false,
}: {
  forumId: string;
  topicId: string;
  replyId: string;
  authorId: string;
  authorType: "user" | "org";
  authorName: string;
  authorImageUrl?: string;
  body: string;
  attachment?: Attachment;
  canManage: boolean;
  canReport?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draftBody, setDraftBody] = useState(body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm("Delete this reply? This can't be undone.")) return;
    setBusy(true);
    setError(null);
    try {
      await deleteReplyAction(forumId, topicId, replyId);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete reply.");
      setBusy(false);
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const formData = new FormData();
    formData.set("body", draftBody);
    const result = await updateReplyAction(forumId, topicId, replyId, {}, formData);
    if (result?.error) {
      setError(result.error);
      setBusy(false);
      return;
    }

    setEditing(false);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <Link
        href={authorType === "org" ? `/orgs/${authorId}` : `/profile/${authorId}`}
        className="flex w-fit items-center gap-2 text-sm text-zinc-500 hover:underline dark:text-zinc-400"
      >
        <Avatar name={authorName} imageUrl={authorImageUrl} size={18} />
        {authorName}
      </Link>

      {editing ? (
        <form onSubmit={handleSave} className="flex flex-col gap-2">
          <textarea
            value={draftBody}
            onChange={(e) => setDraftBody(e.target.value)}
            rows={4}
            maxLength={20000}
            className="rounded-lg border border-line bg-background px-3 py-2 font-mono text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="h-8 w-fit rounded-full bg-accent px-3 text-xs font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setDraftBody(body);
                setError(null);
              }}
              className="h-8 w-fit rounded-full border border-line px-3 text-xs font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          {body && <MarkdownContent>{body}</MarkdownContent>}
          {attachment && <AttachmentPreview attachment={attachment} />}
          {canManage && (
            <div className="flex gap-3">
              <button
                onClick={() => setEditing(true)}
                className="w-fit text-xs font-medium underline underline-offset-2"
              >
                Edit
              </button>
              <button
                onClick={handleDelete}
                disabled={busy}
                className="w-fit text-xs text-red-500 underline underline-offset-2 disabled:opacity-50"
              >
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
          )}
          {canReport && <ReportButton targetType="forum_reply" targetId={`${topicId}:${replyId}`} />}
          {error && <p className="text-xs text-red-500">{error}</p>}
        </>
      )}
    </div>
  );
}
