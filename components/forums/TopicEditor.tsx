"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  deleteTopicAction,
  updateTopicAction,
} from "@/app/forums/[forumId]/[topicId]/actions";
import { pollThenRefresh } from "@/lib/pollRefresh";
import { MarkdownContent } from "@/components/forums/MarkdownContent";

export function TopicEditor({
  forumId,
  topicId,
  title,
  body,
}: {
  forumId: string;
  topicId: string;
  title: string;
  body: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draftBody, setDraftBody] = useState(body);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm("Delete this topic? This can't be undone.")) return;
    setBusy(true);
    setError(null);
    try {
      await deleteTopicAction(forumId, topicId);
      router.push(`/forums/${forumId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete topic.");
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {body && <MarkdownContent>{body}</MarkdownContent>}
        <div className="flex gap-3">
          <button
            onClick={() => {
              setDraftBody(body);
              setEditing(true);
            }}
            className="w-fit text-xs font-medium underline underline-offset-2"
          >
            Edit
          </button>
          <button
            onClick={handleDelete}
            disabled={busy}
            className="w-fit text-xs font-medium text-red-500 underline underline-offset-2 disabled:opacity-50"
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    );
  }

  return (
    <form
      action={async (formData) => {
        setError(null);
        const newTitle = String(formData.get("title") ?? "");
        const result = await updateTopicAction(forumId, topicId, {}, formData);
        if (result?.error) {
          setError(result.error);
          return;
        }
        setEditing(false);
        await pollThenRefresh(
          async () => {
            const res = await fetch(`/api/forums/${forumId}/${topicId}`, {
              cache: "no-store",
            });
            if (!res.ok) return false;
            const { topic } = (await res.json()) as { topic: { title: string } };
            return topic.title === newTitle;
          },
          () => router.refresh(),
        );
      }}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="title" className="text-sm font-medium">
          Title
        </label>
        <input
          id="title"
          name="title"
          defaultValue={title}
          maxLength={140}
          required
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
            <MarkdownContent>{draftBody || "*Nothing to preview yet.*"}</MarkdownContent>
          </div>
        )}
        <textarea
          id="body"
          name="body"
          value={draftBody}
          onChange={(e) => setDraftBody(e.target.value)}
          rows={10}
          maxLength={20000}
          hidden={preview}
          className="rounded-md border border-black/10 bg-transparent px-3 py-2 font-mono text-sm outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40"
        />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          className="h-9 rounded-full bg-accent px-4 text-xs font-medium text-on-accent transition-colors hover:bg-accent-hover"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="h-9 rounded-full border border-black/10 px-4 text-xs font-medium dark:border-white/15"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
