"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createIssueAction } from "@/app/projects/[projectId]/actions";
import type { IssueType } from "@/lib/types";

export function NewIssueForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [type, setType] = useState<IssueType>("bug");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    setError(null);
    formData.set("type", type);
    try {
      const issue = await createIssueAction(projectId, formData);
      router.push(`/projects/${projectId}/issues/${issue.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create issue.");
      setSubmitting(false);
    }
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Type</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setType("bug")}
            className={`h-9 rounded-full border px-4 text-xs font-medium transition-colors ${
              type === "bug"
                ? "border-transparent bg-accent text-on-accent"
                : "border-black/10 dark:border-white/15"
            }`}
          >
            Bug
          </button>
          <button
            type="button"
            onClick={() => setType("feature")}
            className={`h-9 rounded-full border px-4 text-xs font-medium transition-colors ${
              type === "feature"
                ? "border-transparent bg-accent text-on-accent"
                : "border-black/10 dark:border-white/15"
            }`}
          >
            Feature request
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="title" className="text-sm font-medium">
          Title
        </label>
        <input
          id="title"
          name="title"
          maxLength={140}
          required
          placeholder={
            type === "bug" ? "e.g. Crashes on upload" : "e.g. Add dark mode toggle"
          }
          className="rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="body" className="text-sm font-medium">
          Description
        </label>
        <textarea
          id="body"
          name="body"
          rows={6}
          maxLength={10000}
          placeholder={
            type === "bug"
              ? "What happened? What did you expect instead? Steps to reproduce help."
              : "What's the feature, and why would it help?"
          }
          className="rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40"
        />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="h-10 w-fit rounded-full bg-accent px-5 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {submitting ? "Creating…" : "Create issue"}
      </button>
    </form>
  );
}
