"use client";

import { useActionState, useState } from "react";
import { createOrgAction } from "@/app/orgs/actions";
import { Avatar } from "@/components/Avatar";

export function NewOrgForm() {
  const [state, formAction, pending] = useActionState(createOrgAction, {});
  const [preview, setPreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [name, setName] = useState("");

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <Avatar name={name || "?"} imageUrl={preview} size={56} />
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
          required
          maxLength={80}
          className="rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40"
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
          placeholder="What's this team about?"
          className="rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40"
        />
      </div>

      {state.error && <p className="text-sm text-red-500">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 h-11 rounded-full bg-accent px-5 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create organization"}
      </button>
    </form>
  );
}
