"use client";

import { useActionState, useState } from "react";
import { createTopicAction } from "@/app/forums/[forumId]/actions";
import { MarkdownContent } from "@/components/forums/MarkdownContent";
import { AttachmentButton } from "@/components/AttachmentButton";
import { EmojiPicker } from "@/components/EmojiPicker";
import { PostAsSelect } from "@/components/forums/PostAsSelect";
import { uploadAttachment, type Attachment } from "@/lib/clientUpload";

export function NewTopicForm({
  forumId,
  orgs = [],
}: {
  forumId: string;
  orgs?: { id: string; name: string }[];
}) {
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prevState: { error?: string }, formData: FormData) => {
      if (attachment) formData.set("attachment", JSON.stringify(attachment));
      return createTopicAction(forumId, prevState, formData);
    },
    {},
  );
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState(false);

  async function handleAttach(file: File) {
    setUploading(true);
    try {
      setAttachment(await uploadAttachment(`forums/${forumId}/attachments`, file));
    } catch {
      // Best-effort: leave the composer as-is so the user can retry.
    } finally {
      setUploading(false);
    }
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <PostAsSelect orgs={orgs} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="title" className="text-sm font-medium">
          Title
        </label>
        <input
          id="title"
          name="title"
          required
          maxLength={140}
          className="rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="body" className="text-sm font-medium">
            Body (Markdown supported)
          </label>
          <button
            type="button"
            onClick={() => setPreview((p) => !p)}
            className="text-xs font-medium underline underline-offset-2"
          >
            {preview ? "Edit" : "Preview"}
          </button>
        </div>
        {preview && (
          <div className="min-h-32 rounded-md border border-black/10 px-3 py-2 dark:border-white/15">
            <MarkdownContent>{body || "*Nothing to preview yet.*"}</MarkdownContent>
          </div>
        )}
        <textarea
          id="body"
          name="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={10}
          maxLength={20000}
          placeholder="Write your post using Markdown..."
          hidden={preview}
          className="rounded-md border border-black/10 bg-transparent px-3 py-2 font-mono text-sm outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40"
        />
      </div>

      {attachment && (
        <div className="flex w-fit items-center gap-2 rounded-md border border-black/10 px-2 py-1 text-xs dark:border-white/15">
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

      <div className="flex items-center gap-1">
        <EmojiPicker onSelect={(emoji) => setBody((b) => b + emoji)} />
        <AttachmentButton onFileSelected={handleAttach} disabled={uploading} />
      </div>

      {state.error && <p className="text-sm text-red-500">{state.error}</p>}

      <button
        type="submit"
        disabled={pending || uploading}
        className="mt-2 h-11 w-fit rounded-full bg-accent px-5 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {pending ? "Posting…" : "Post topic"}
      </button>
    </form>
  );
}
