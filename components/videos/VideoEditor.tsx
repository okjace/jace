"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteVideoAction, updateVideoAction } from "@/app/videos/[videoId]/actions";
import { pollThenRefresh } from "@/lib/pollRefresh";
import type { VideoVisibility } from "@/lib/types";

const VISIBILITY_OPTIONS: { value: VideoVisibility; label: string; hint: string }[] = [
  { value: "public", label: "Public", hint: "Anyone can find and watch this video" },
  { value: "unlisted", label: "Unlisted", hint: "Hidden from listings and search — viewable by anyone with the link" },
  { value: "private", label: "Private", hint: "Only you (or your org's members) can view this" },
];

export function VideoEditor({
  videoId,
  title,
  description,
  thumbnailUrl,
  visibility,
}: {
  videoId: string;
  title: string;
  description: string;
  thumbnailUrl?: string;
  visibility: VideoVisibility;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this video? This can't be undone.")) return;
    setBusy(true);
    try {
      await deleteVideoAction(videoId);
      router.push("/videos");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete video.");
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex flex-col gap-2">
        {visibility !== "public" && (
          <span className="w-fit rounded-full border border-line px-2 py-0.5 text-xs font-medium capitalize text-zinc-500 dark:text-zinc-400">
            {visibility}
          </span>
        )}
        <p className="whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">
          {description || "No description."}
        </p>
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
        try {
          await updateVideoAction(videoId, formData);
          setEditing(false);
          await pollThenRefresh(async () => {
            const res = await fetch(`/api/videos/${videoId}`, {
              cache: "no-store",
            });
            if (!res.ok) return false;
            const { video } = (await res.json()) as { video: { title: string } };
            return video.title === newTitle;
          }, () => router.refresh());
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to update video.");
        }
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
          className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className="text-sm font-medium">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          defaultValue={description}
          rows={3}
          maxLength={2000}
          className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="thumbnailUrl" className="text-sm font-medium">
          Thumbnail URL
        </label>
        <input
          id="thumbnailUrl"
          name="thumbnailUrl"
          defaultValue={thumbnailUrl}
          placeholder="Paste an image URL"
          className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Visibility</span>
        <div className="flex flex-col gap-2">
          {VISIBILITY_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="visibility"
                value={opt.value}
                defaultChecked={visibility === opt.value}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">{opt.label}</span>
                <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                  {opt.hint}
                </span>
              </span>
            </label>
          ))}
        </div>
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
          className="h-9 rounded-full border border-line px-4 text-xs font-medium"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
