"use client";

import { useActionState, useState } from "react";
import { createProjectAction } from "@/app/projects/actions";
import { Avatar } from "@/components/Avatar";
import { OwnerPicker } from "@/components/OwnerPicker";

type OrgOption = { id: string; name: string };

export function NewProjectForm({ orgs = [] }: { orgs?: OrgOption[] }) {
  const [state, formAction, pending] = useActionState(createProjectAction, {});
  const [preview, setPreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [postAsOrgId, setPostAsOrgId] = useState("");
  const [name, setName] = useState("");

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <OwnerPicker orgs={orgs} value={postAsOrgId} onChange={setPostAsOrgId} />

      <div className="flex flex-col gap-1.5 rounded-2xl border border-line bg-panel p-4">
        <label htmlFor="githubRepo" className="text-sm font-medium">
          GitHub repository (optional)
        </label>
        <input
          id="githubRepo"
          name="githubRepo"
          placeholder="owner/repo or https://github.com/owner/repo"
          className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
        <p className="text-xs text-muted">
          Keeps this project synced with a public repo: its description,
          website, README, and releases (as versions). Anything you leave
          blank below is filled in from GitHub.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <Avatar name={name || "?"} imageUrl={preview} size={56} shape="square" />
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
              if (file) setPreview(URL.createObjectURL(file));
            }}
            className="text-xs"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="banner" className="text-xs font-medium">
          Banner (optional)
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
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          placeholder="Leave blank to use the GitHub repo's name"
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
          rows={3}
          maxLength={2000}
          placeholder="What's this project about?"
          className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </div>

      {state.error && <p className="text-sm text-red-500">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 h-11 rounded-full bg-accent px-5 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create project"}
      </button>
    </form>
  );
}
