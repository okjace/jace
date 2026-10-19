"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteOrgAction, updateOrgAction } from "@/app/orgs/[orgId]/actions";
import type { SocialLink } from "@/lib/types";
import { Avatar } from "@/components/Avatar";
import { pollThenRefresh } from "@/lib/pollRefresh";

export function OrgEditor({
  orgId,
  name,
  description,
  website,
  socialLinks,
  imageUrl,
  isOwner,
}: {
  orgId: string;
  name: string;
  description: string;
  website?: string;
  socialLinks: SocialLink[];
  imageUrl?: string;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [links, setLinks] = useState<SocialLink[]>(socialLinks);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (
      !confirm(
        "Delete this organization and all of its projects/videos? This can't be undone.",
      )
    )
      return;
    setDeleting(true);
    try {
      await deleteOrgAction(orgId);
      router.push("/orgs");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete organization.");
      setDeleting(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex flex-col gap-3">
        <p className="whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">
          {description || "No description yet."}
        </p>
        {(website || socialLinks.length > 0) && (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {website && (
              <a
                href={website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm underline underline-offset-2"
              >
                {website.replace(/^https?:\/\//, "")}
              </a>
            )}
            {socialLinks.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm underline underline-offset-2"
              >
                {link.label}
              </a>
            ))}
          </div>
        )}
        <div className="flex gap-3">
          <button
            onClick={() => setEditing(true)}
            className="w-fit text-xs font-medium underline underline-offset-2"
          >
            Edit organization
          </button>
          {isOwner && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="w-fit text-xs font-medium text-red-500 underline underline-offset-2 disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete organization"}
            </button>
          )}
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    );
  }

  function addLink() {
    setLinks((prev) => [...prev, { id: crypto.randomUUID(), label: "", url: "" }]);
  }
  function updateLink(id: string, patch: Partial<SocialLink>) {
    setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }
  function removeLink(id: string) {
    setLinks((prev) => prev.filter((l) => l.id !== id));
  }

  return (
    <form
      action={async (formData) => {
        setSubmitting(true);
        setError(null);
        formData.set(
          "socialLinks",
          JSON.stringify(links.filter((l) => l.label.trim() && l.url.trim())),
        );
        const newName = String(formData.get("name") ?? "");
        try {
          await updateOrgAction(orgId, formData);
          setEditing(false);
          setIconPreview(null);
          setBannerPreview(null);
          await pollThenRefresh(async () => {
            const res = await fetch(`/api/orgs/${orgId}`, { cache: "no-store" });
            if (!res.ok) return false;
            const { org } = (await res.json()) as { org: { name: string } };
            return org.name === newName;
          }, () => router.refresh());
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Failed to update organization.",
          );
        } finally {
          setSubmitting(false);
        }
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex items-center gap-4">
        <Avatar name={name} imageUrl={iconPreview ?? imageUrl} size={64} />
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
          defaultValue={description}
          rows={3}
          maxLength={2000}
          className="rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="website" className="text-sm font-medium">
          Website
        </label>
        <input
          id="website"
          name="website"
          defaultValue={website ?? ""}
          placeholder="example.com"
          className="rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40"
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Social links</span>
        {links.map((link) => (
          <div key={link.id} className="flex gap-2">
            <input
              value={link.label}
              onChange={(e) => updateLink(link.id, { label: e.target.value })}
              placeholder="Label"
              className="w-28 rounded-md border border-black/10 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40"
            />
            <input
              value={link.url}
              onChange={(e) => updateLink(link.id, { url: e.target.value })}
              placeholder="https://..."
              className="flex-1 rounded-md border border-black/10 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40"
            />
            <button
              type="button"
              onClick={() => removeLink(link.id)}
              className="text-xs text-red-500"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addLink}
          className="w-fit text-xs font-medium underline underline-offset-2"
        >
          + Add link
        </button>
      </div>

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
            setEditing(false);
            setIconPreview(null);
            setBannerPreview(null);
            setError(null);
          }}
          className="h-9 rounded-full border border-black/10 px-4 text-xs font-medium dark:border-white/15"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
