"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { uploadAll } from "@/lib/clientUpload";

export function AddVersionForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!label.trim()) {
      setError("Give this version a label, like v1.0.0.");
      return;
    }
    setError(null);
    setSubmitting(true);
    setProgress(0);

    const form = e.currentTarget;
    const filesInput = form.elements.namedItem("files") as HTMLInputElement;
    const sourceInput = form.elements.namedItem("sourceFiles") as HTMLInputElement;
    const versionFolder = crypto.randomUUID();

    try {
      setStatus("Uploading files…");
      const files = await uploadAll(
        `projects/${projectId}/versions/${versionFolder}/files`,
        filesInput.files,
        setProgress,
      );

      setStatus("Uploading source code…");
      const sourceFiles = await uploadAll(
        `projects/${projectId}/versions/${versionFolder}/source`,
        sourceInput.files,
        setProgress,
      );

      setStatus("Saving version…");
      const res = await fetch(`/api/projects/${projectId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, description, files, sourceFiles, downloadUrl }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to save version.");
      }

      const { version } = (await res.json()) as { version: { id: string } };

      // The version is durably saved at this point, but the JSON-file store
      // behind this app sits on a CDN, so a read immediately after this
      // write can briefly miss it. Poll the API until the new version shows
      // up before refreshing the server-rendered page, instead of refreshing
      // blind and risking a stale render.
      setStatus("Finalizing…");
      const delays = [400, 700, 1000, 1300, 1600, 2000, 2500, 3000, 3500, 4000, 4000, 4000];
      for (const delay of delays) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        const check = await fetch(`/api/projects/${projectId}`, {
          cache: "no-store",
        });
        if (check.ok) {
          const { project } = (await check.json()) as {
            project: { versions: { id: string }[] };
          };
          if (project.versions.some((v) => v.id === version.id)) break;
        }
      }

      setLabel("");
      setDescription("");
      setDownloadUrl("");
      form.reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setSubmitting(false);
      setProgress(null);
      setStatus(null);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="label" className="text-sm font-medium">
          Version label
        </label>
        <input
          id="label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="v1.0.0"
          maxLength={40}
          className="rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="version-description" className="text-sm font-medium">
          Description
        </label>
        <textarea
          id="version-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What changed in this version?"
          rows={3}
          maxLength={2000}
          className="rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="files" className="text-sm font-medium">
          Files
        </label>
        <input id="files" name="files" type="file" multiple className="text-sm" />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="sourceFiles" className="text-sm font-medium">
          Source code
        </label>
        <input
          id="sourceFiles"
          name="sourceFiles"
          type="file"
          multiple
          className="text-sm"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="downloadUrl" className="text-sm font-medium">
          Download link (optional)
        </label>
        <input
          id="downloadUrl"
          value={downloadUrl}
          onChange={(e) => setDownloadUrl(e.target.value)}
          placeholder="e.g. a GitHub Releases link, for files too large to upload here"
          className="rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40"
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
        className="h-10 w-fit rounded-full bg-accent px-5 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {submitting ? "Uploading…" : "Add version"}
      </button>
    </form>
  );
}
