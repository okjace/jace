"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createReplyAction } from "@/app/forums/[forumId]/[topicId]/actions";
import { pollThenRefresh } from "@/lib/pollRefresh";
import { AttachmentButton } from "@/components/AttachmentButton";
import { EmojiPicker } from "@/components/EmojiPicker";
import { PostAsSelect } from "@/components/forums/PostAsSelect";
import { uploadAttachment, type Attachment } from "@/lib/clientUpload";

export function ReplyForm({
  forumId,
  topicId,
  initialReplyCount,
  orgs = [],
}: {
  forumId: string;
  topicId: string;
  initialReplyCount: number;
  orgs?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [postAsOrgId, setPostAsOrgId] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleAttach(file: File) {
    setUploading(true);
    setError(null);
    try {
      setAttachment(await uploadAttachment(`forums/${forumId}/attachments`, file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload file.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() && !attachment) return;
    setSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.set("body", body);
    if (postAsOrgId) formData.set("postAsOrgId", postAsOrgId);
    if (attachment) formData.set("attachment", JSON.stringify(attachment));

    const result = await createReplyAction(forumId, topicId, {}, formData);
    if (result?.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    setBody("");
    setAttachment(null);
    await pollThenRefresh(
      async () => {
        const res = await fetch(`/api/forums/${forumId}/${topicId}`, {
          cache: "no-store",
        });
        if (!res.ok) return false;
        const { topic } = (await res.json()) as { topic: { replies: unknown[] } };
        return topic.replies.length > initialReplyCount;
      },
      () => router.refresh(),
    );
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <PostAsSelect orgs={orgs} value={postAsOrgId} onChange={setPostAsOrgId} />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        maxLength={20000}
        placeholder="Write a reply using Markdown..."
        className="rounded-lg border border-line bg-background px-3 py-2 font-mono text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
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
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex items-center gap-1">
        <EmojiPicker onSelect={(emoji) => setBody((b) => b + emoji)} />
        <AttachmentButton onFileSelected={handleAttach} disabled={uploading} />
        <button
          type="submit"
          disabled={submitting || uploading}
          className="ml-1 h-9 w-fit rounded-full bg-accent px-4 text-xs font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {submitting ? "Posting…" : "Reply"}
        </button>
      </div>
    </form>
  );
}
