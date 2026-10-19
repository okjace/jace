"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { OwnerPicker } from "@/components/OwnerPicker";
import { supabasePublicUrl, uploadToSignedUrl } from "@/lib/clientUpload";

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

async function uploadViaSignedUrl(
  pathname: string,
  file: File,
  tokenRoute: string,
  onProgress?: (percentage: number) => void,
): Promise<string> {
  const res = await fetch(tokenRoute, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pathname }),
  });
  if (!res.ok) throw new Error("Could not start upload.");
  const { path, signedUrl } = (await res.json()) as {
    path: string;
    signedUrl: string;
  };
  await uploadToSignedUrl(signedUrl, file, onProgress);
  return supabasePublicUrl(path);
}

type OrgOption = { id: string; name: string };
type Visibility = "public" | "unlisted" | "private";

const VISIBILITY_OPTIONS: { value: Visibility; label: string; hint: string }[] = [
  { value: "public", label: "Public", hint: "Anyone can find and watch this video" },
  { value: "unlisted", label: "Unlisted", hint: "Hidden from listings and search — viewable by anyone with the link" },
  { value: "private", label: "Private", hint: "Only you (or your org's members) can view this" },
];

export function VideoUploadForm({
  defaultTitle = "",
  defaultDescription = "",
  orgs = [],
}: {
  defaultTitle?: string;
  defaultDescription?: string;
  orgs?: OrgOption[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(defaultDescription);
  const [file, setFile] = useState<File | null>(null);
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [thumbnailUrlInput, setThumbnailUrlInput] = useState("");
  const [postAsOrgId, setPostAsOrgId] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [progress, setProgress] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) {
      setError("Choose a video file first.");
      return;
    }
    setError(null);
    setSubmitting(true);
    setProgress(0);

    try {
      const pathname = `videos/${crypto.randomUUID()}-${file.name}`;

      setStatus("Uploading video…");
      const url = await uploadViaSignedUrl(
        pathname,
        file,
        "/api/videos/upload",
        (percentage) => setProgress(percentage),
      );

      let thumbnailUrl: string | undefined =
        normalizeUrl(thumbnailUrlInput) || undefined;
      if (!thumbnailUrl && thumbnail) {
        setStatus("Uploading thumbnail…");
        const thumbPathname = `videos/thumbnails/${crypto.randomUUID()}-${thumbnail.name}`;
        thumbnailUrl = await uploadViaSignedUrl(
          thumbPathname,
          thumbnail,
          "/api/uploads/token",
        );
      }

      setStatus("Saving video…");
      const res = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          pathname,
          title: title.trim() || file.name,
          description: description.trim(),
          thumbnailUrl,
          contentType: file.type || "video/mp4",
          size: file.size,
          postAsOrgId: postAsOrgId || undefined,
          visibility,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save video details.");
      }

      const { video } = (await res.json()) as { video: { id: string } };

      setStatus("Finalizing…");
      const delays = [400, 700, 1000, 1300, 1600, 2000, 2500, 3000, 3500, 4000, 4000, 4000];
      for (const delay of delays) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        const check = await fetch(`/api/videos/${video.id}`, { cache: "no-store" });
        if (check.ok) break;
      }

      router.push(`/videos/${video.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setSubmitting(false);
      setProgress(null);
      setStatus(null);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <OwnerPicker orgs={orgs} value={postAsOrgId} onChange={setPostAsOrgId} />

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Visibility</span>
        <div className="flex flex-col gap-2">
          {VISIBILITY_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="visibility"
                value={opt.value}
                checked={visibility === opt.value}
                onChange={() => setVisibility(opt.value)}
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

      <div className="flex flex-col gap-1.5">
        <label htmlFor="title" className="text-sm font-medium">
          Title
        </label>
        <input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="My awesome clip"
          maxLength={140}
          className="rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className="text-sm font-medium">
          Description
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What's in this video?"
          rows={3}
          maxLength={2000}
          className="rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="file" className="text-sm font-medium">
          Video file
        </label>
        <input
          id="file"
          type="file"
          accept="video/mp4,video/webm,video/quicktime,video/ogg"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="thumbnail" className="text-sm font-medium">
          Thumbnail (optional)
        </label>
        <input
          id="thumbnail"
          type="file"
          accept="image/*"
          onChange={(e) => setThumbnail(e.target.files?.[0] ?? null)}
          disabled={!!thumbnailUrlInput}
          className="text-sm disabled:opacity-50"
        />
        <input
          value={thumbnailUrlInput}
          onChange={(e) => setThumbnailUrlInput(e.target.value)}
          placeholder="Or paste an image URL"
          disabled={!!thumbnail}
          className="rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 disabled:opacity-50 dark:border-white/15 dark:focus:border-white/40"
        />
      </div>

      {progress !== null && (
        <div className="flex flex-col gap-1">
          {status && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{status}</p>
          )}
          <div className="h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
            <div
              className="h-full bg-foreground transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="mt-2 h-11 rounded-full bg-accent px-5 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {submitting ? "Uploading…" : "Upload video"}
      </button>
    </form>
  );
}
