"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ProjectFile, ProjectVersion } from "@/lib/types";
import { formatBytes } from "@/lib/format";
import { uploadAll } from "@/lib/clientUpload";
import { MarkdownContent } from "@/components/forums/MarkdownContent";

function FileLinks({
  files,
  label,
}: {
  files: ProjectFile[];
  label: string;
}) {
  if (files.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <ul className="flex flex-col gap-1">
        {files.map((file) => (
          <li key={file.id}>
            <a href={file.url} className="text-sm underline underline-offset-2">
              {file.name}
            </a>{" "}
            {/* GitHub's tag archives have no known size. */}
            {file.size > 0 && (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                ({formatBytes(file.size)})
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FileListEditor({
  label,
  files,
  onRemove,
}: {
  label: string;
  files: ProjectFile[];
  onRemove: (id: string) => void;
}) {
  if (files.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      <ul className="flex flex-col gap-1">
        {files.map((file) => (
          <li key={file.id} className="flex items-center gap-2 text-sm">
            <span className="truncate">{file.name}</span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              ({formatBytes(file.size)})
            </span>
            <button
              type="button"
              onClick={() => onRemove(file.id)}
              className="text-xs text-red-500 underline underline-offset-2"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function VersionCard({
  projectId,
  version,
  canManage,
}: {
  projectId: string;
  version: ProjectVersion;
  canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(version.label);
  const [description, setDescription] = useState(version.description);
  const [downloadUrl, setDownloadUrl] = useState(version.downloadUrl ?? "");
  const [files, setFiles] = useState(version.files);
  const [sourceFiles, setSourceFiles] = useState(version.sourceFiles);
  const [progress, setProgress] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busy, setBusy] = useState(false);

  function resetEdits() {
    setLabel(version.label);
    setDescription(version.description);
    setDownloadUrl(version.downloadUrl ?? "");
    setFiles(version.files);
    setSourceFiles(version.sourceFiles);
    setError(null);
  }

  async function handleDelete() {
    if (!confirm("Delete this version? This can't be undone.")) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/versions/${version.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Failed to delete version.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete version.");
      setBusy(false);
    }
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!label.trim()) {
      setError("Give this version a label, like v1.0.0.");
      return;
    }
    setError(null);
    setSubmitting(true);
    setProgress(0);

    const form = e.currentTarget;
    const filesInput = form.elements.namedItem("newFiles") as HTMLInputElement;
    const sourceInput = form.elements.namedItem(
      "newSourceFiles",
    ) as HTMLInputElement;

    try {
      setStatus("Uploading files…");
      const uploadedFiles = await uploadAll(
        `projects/${projectId}/versions/${version.id}/files`,
        filesInput.files,
        setProgress,
      );
      setStatus("Uploading source code…");
      const uploadedSourceFiles = await uploadAll(
        `projects/${projectId}/versions/${version.id}/source`,
        sourceInput.files,
        setProgress,
      );

      setStatus("Saving version…");
      const nextFiles: ProjectFile[] = [
        ...files,
        ...uploadedFiles.map((f) => ({ ...f, id: crypto.randomUUID() })),
      ];
      const nextSourceFiles: ProjectFile[] = [
        ...sourceFiles,
        ...uploadedSourceFiles.map((f) => ({ ...f, id: crypto.randomUUID() })),
      ];

      const res = await fetch(
        `/api/projects/${projectId}/versions/${version.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label,
            description,
            downloadUrl,
            files: nextFiles,
            sourceFiles: nextSourceFiles,
          }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to save version.");
      }

      setFiles(nextFiles);
      setSourceFiles(nextSourceFiles);
      form.reset();
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save version.");
    } finally {
      setSubmitting(false);
      setProgress(null);
      setStatus(null);
    }
  }

  if (!editing) {
    return (
      <div className="rounded-2xl border border-line bg-panel p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{version.label}</h3>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {new Date(version.createdAt).toLocaleDateString()}
          </span>
        </div>
        {version.description && (
          <div className="mt-2">
            <MarkdownContent>{version.description}</MarkdownContent>
          </div>
        )}

        {version.downloadUrl && (
          <a
            href={version.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex h-9 w-fit items-center rounded-full bg-accent px-4 text-xs font-medium text-on-accent transition-colors hover:bg-accent-hover"
          >
            Download
          </a>
        )}

        <FileLinks files={version.files} label="Files" />
        <FileLinks files={version.sourceFiles} label="Source code" />

        {canManage && (
          <div className="mt-3 flex gap-3">
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
        )}
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSave}
      className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-5"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`label-${version.id}`} className="text-sm font-medium">
          Version label
        </label>
        <input
          id={`label-${version.id}`}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={40}
          className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`description-${version.id}`}
          className="text-sm font-medium"
        >
          Description
        </label>
        <textarea
          id={`description-${version.id}`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={2000}
          className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`downloadUrl-${version.id}`}
          className="text-sm font-medium"
        >
          Download link (optional)
        </label>
        <input
          id={`downloadUrl-${version.id}`}
          value={downloadUrl}
          onChange={(e) => setDownloadUrl(e.target.value)}
          placeholder="e.g. a GitHub Releases link, for files too large to upload here"
          className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </div>

      <FileListEditor
        label="Files"
        files={files}
        onRemove={(id) => setFiles((prev) => prev.filter((f) => f.id !== id))}
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`newFiles-${version.id}`} className="text-sm font-medium">
          Add files
        </label>
        <input
          id={`newFiles-${version.id}`}
          name="newFiles"
          type="file"
          multiple
          className="text-sm"
        />
      </div>

      <FileListEditor
        label="Source code"
        files={sourceFiles}
        onRemove={(id) =>
          setSourceFiles((prev) => prev.filter((f) => f.id !== id))
        }
      />
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`newSourceFiles-${version.id}`}
          className="text-sm font-medium"
        >
          Add source code
        </label>
        <input
          id={`newSourceFiles-${version.id}`}
          name="newSourceFiles"
          type="file"
          multiple
          className="text-sm"
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

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="h-9 rounded-full bg-accent px-4 text-xs font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            resetEdits();
            setEditing(false);
          }}
          className="h-9 rounded-full border border-line px-4 text-xs font-medium"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
