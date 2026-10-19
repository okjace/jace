"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  deleteProjectAction,
  updateProjectAction,
} from "@/app/projects/[projectId]/actions";
import { Avatar } from "@/components/Avatar";
import { pollThenRefresh } from "@/lib/pollRefresh";

export function ProjectEditor({
  projectId,
  name,
  description,
  readme,
  iconUrl,
  websiteUrl,
  sourceUrl,
  sortOrder,
}: {
  projectId: string;
  name: string;
  description: string;
  readme: string;
  iconUrl?: string;
  websiteUrl?: string;
  sourceUrl?: string;
  sortOrder: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (
      !confirm(
        "Delete this project and all of its versions/files? This can't be undone.",
      )
    )
      return;
    setBusy(true);
    try {
      await deleteProjectAction(projectId);
      router.push("/projects");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete project.");
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex gap-3">
        <button
          onClick={() => setEditing(true)}
          className="w-fit text-xs font-medium underline underline-offset-2"
        >
          Edit project
        </button>
        <button
          onClick={handleDelete}
          disabled={busy}
          className="w-fit text-xs font-medium text-red-500 underline underline-offset-2 disabled:opacity-50"
        >
          {busy ? "Deleting…" : "Delete project"}
        </button>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    );
  }

  return (
    <form
      action={async (formData) => {
        setError(null);
        const newName = String(formData.get("name") ?? "");
        try {
          await updateProjectAction(projectId, formData);
          setEditing(false);
          setIconPreview(null);
          setBannerPreview(null);
          await pollThenRefresh(async () => {
            const res = await fetch(`/api/projects/${projectId}`, {
              cache: "no-store",
            });
            if (!res.ok) return false;
            const { project } = (await res.json()) as { project: { name: string } };
            return project.name === newName;
          }, () => router.refresh());
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Failed to update project.",
          );
        }
      }}
      className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-5"
    >
      <div className="flex items-center gap-4">
        <Avatar
          name={name}
          imageUrl={iconPreview ?? iconUrl}
          size={56}
          shape="square"
        />
        <div className="flex flex-col gap-1">
          <label htmlFor="icon" className="text-xs font-medium">
            Icon
          </label>
          <input
            id="icon"
            type="file"
            name="icon"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setIconPreview(URL.createObjectURL(file));
            }}
            className="text-xs"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="banner" className="text-xs font-medium">
          Banner
        </label>
        {bannerPreview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bannerPreview}
            alt=""
            className="h-24 w-full rounded-md object-cover"
          />
        )}
        <input
          id="banner"
          type="file"
          name="banner"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) setBannerPreview(URL.createObjectURL(file));
          }}
          className="text-xs"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-sm font-medium">
          Name
        </label>
        <input
          id="name"
          name="name"
          defaultValue={name}
          maxLength={80}
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="websiteUrl" className="text-sm font-medium">
            Website
          </label>
          <input
            id="websiteUrl"
            name="websiteUrl"
            defaultValue={websiteUrl ?? ""}
            placeholder="example.vercel.app"
            className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="sourceUrl" className="text-sm font-medium">
            Source code
          </label>
          <input
            id="sourceUrl"
            name="sourceUrl"
            defaultValue={sourceUrl ?? ""}
            placeholder="github.com/you/repo"
            className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="sortOrder" className="text-sm font-medium">
          Order on the home page
        </label>
        <input
          id="sortOrder"
          name="sortOrder"
          type="number"
          defaultValue={sortOrder}
          className="w-24 rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Lower numbers show first.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="readme" className="text-sm font-medium">
          README
        </label>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          A longer writeup, rendered as Markdown — for setup steps, usage docs,
          anything the short description doesn&rsquo;t fit.
        </p>
        <textarea
          id="readme"
          name="readme"
          defaultValue={readme}
          rows={8}
          maxLength={20000}
          placeholder={"## Getting started\n\n..."}
          className="rounded-lg border border-line bg-background px-3 py-2 font-mono text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
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
          className="h-9 rounded-full border border-line px-4 text-xs font-medium"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
