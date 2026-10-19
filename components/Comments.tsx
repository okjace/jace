"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Comment } from "@/lib/types";
import { Avatar } from "@/components/Avatar";
import { AttachmentButton } from "@/components/AttachmentButton";
import { AttachmentPreview } from "@/components/AttachmentPreview";
import { EmojiPicker } from "@/components/EmojiPicker";
import { uploadAttachment, type Attachment } from "@/lib/clientUpload";
import { ReportButton } from "@/components/reports/ReportButton";

export function Comments({
  comments,
  avatarUrls,
  currentUserId,
  canModerate,
  attachmentPathPrefix,
  addAction,
  deleteAction,
  onTogglePin,
  reportType,
  reportParentId,
}: {
  comments: Comment[];
  avatarUrls: Map<string, string | undefined>;
  currentUserId?: string;
  canModerate: boolean;
  /** Storage folder attachments upload into, e.g. `videos/{id}/comments`. */
  attachmentPathPrefix: string;
  addAction: (formData: FormData) => Promise<void>;
  deleteAction: (commentId: string) => Promise<void>;
  /** Owner-only: pin (or unpin) a comment. Omit to disable pinning entirely. */
  onTogglePin?: (commentId: string, pinned: boolean) => Promise<void>;
  /** When set, other people's comments get a Report button (targetId is `${reportParentId}:${commentId}`). */
  reportType?: "video_comment";
  reportParentId?: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pinningId, setPinningId] = useState<string | null>(null);

  const pinned = comments.find((c) => c.pinned);
  const rest = comments.filter((c) => c.id !== pinned?.id);
  const ordered = pinned ? [pinned, ...rest] : rest;

  async function handleAttach(file: File) {
    setUploading(true);
    setError(null);
    try {
      setAttachment(await uploadAttachment(attachmentPathPrefix, file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload file.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    setError(null);
    if (attachment) formData.set("attachment", JSON.stringify(attachment));
    try {
      await addAction(formData);
      setBody("");
      setAttachment(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post comment.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(commentId: string) {
    setDeletingId(commentId);
    try {
      await deleteAction(commentId);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete comment.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleTogglePin(commentId: string, nextPinned: boolean) {
    if (!onTogglePin) return;
    setPinningId(commentId);
    try {
      await onTogglePin(commentId, nextPinned);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update pin.");
    } finally {
      setPinningId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold">
        Comments{comments.length > 0 ? ` (${comments.length})` : ""}
      </h2>

      {currentUserId ? (
        <form action={handleSubmit} className="flex flex-col gap-2">
          <textarea
            name="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a comment"
            rows={2}
            maxLength={2000}
            className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          {attachment && (
            <div className="flex w-fit items-center gap-2 rounded-md border border-line px-2 py-1 text-xs">
              📎 {attachment.name}
              <button
                type="button"
                onClick={() => setAttachment(null)}
                className="text-red-500"
                aria-label="Remove attachment"
              >
                ✕
              </button>
            </div>
          )}
          {uploading && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Uploading…</p>
          )}
          <div className="flex items-center gap-1">
            <EmojiPicker onSelect={(emoji) => setBody((b) => b + emoji)} />
            <AttachmentButton onFileSelected={handleAttach} disabled={uploading} />
            <button
              type="submit"
              disabled={submitting || uploading || (!body.trim() && !attachment)}
              className="ml-1 h-9 w-fit rounded-full bg-accent px-4 text-xs font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {submitting ? "Posting…" : "Comment"}
            </button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          <Link href="/sign-in" className="underline underline-offset-2">
            Sign in
          </Link>{" "}
          to leave a comment.
        </p>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      {comments.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No comments yet.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {ordered.map((comment) => (
            <div key={comment.id} className="flex gap-3">
              <Avatar
                name={comment.authorName}
                imageUrl={avatarUrls.get(comment.authorId)}
                size={28}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  {comment.pinned && (
                    <span className="flex items-center gap-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      📌 Pinned
                    </span>
                  )}
                  <Link
                    href={`/profile/${comment.authorId}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {comment.authorName}
                  </Link>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {new Date(comment.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {comment.body && (
                  <p className="whitespace-pre-wrap break-words text-sm text-zinc-600 dark:text-zinc-400">
                    {comment.body}
                  </p>
                )}
                {comment.attachment && (
                  <AttachmentPreview attachment={comment.attachment} />
                )}
                <div className="mt-1 flex gap-3">
                  {(comment.authorId === currentUserId || canModerate) && (
                    <button
                      onClick={() => handleDelete(comment.id)}
                      disabled={deletingId === comment.id}
                      className="text-xs text-red-500 underline underline-offset-2 disabled:opacity-50"
                    >
                      {deletingId === comment.id ? "Deleting…" : "Delete"}
                    </button>
                  )}
                  {reportType && reportParentId && comment.authorId !== currentUserId && (
                    <ReportButton targetType={reportType} targetId={`${reportParentId}:${comment.id}`} />
                  )}
                  {canModerate && onTogglePin && (
                    <button
                      onClick={() => handleTogglePin(comment.id, !comment.pinned)}
                      disabled={pinningId === comment.id}
                      className="text-xs font-medium underline underline-offset-2 disabled:opacity-50"
                    >
                      {pinningId === comment.id
                        ? "…"
                        : comment.pinned
                          ? "Unpin"
                          : "Pin"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
