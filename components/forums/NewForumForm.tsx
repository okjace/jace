"use client";

import { useActionState } from "react";
import { createForumAction } from "@/app/forums/actions";

export function NewForumForm() {
  const [state, formAction, pending] = useActionState(createForumAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-sm font-medium">
          Name
        </label>
        <input
          id="name"
          name="name"
          required
          maxLength={80}
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
          className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="postPermission" className="text-sm font-medium">
          Who can create topics
        </label>
        <select
          id="postPermission"
          name="postPermission"
          defaultValue="everyone"
          className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        >
          <option value="everyone">Everyone</option>
          <option value="adminOnly">Only me</option>
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="replyPermission" className="text-sm font-medium">
          Who can reply
        </label>
        <select
          id="replyPermission"
          name="replyPermission"
          defaultValue="everyone"
          className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        >
          <option value="everyone">Everyone</option>
          <option value="adminOnly">Only me</option>
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="viewPermission" className="text-sm font-medium">
          Who can view
        </label>
        <select
          id="viewPermission"
          name="viewPermission"
          defaultValue="everyone"
          className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        >
          <option value="everyone">Everyone</option>
          <option value="adminOnly">Only me</option>
        </select>
      </div>

      {state.error && <p className="text-sm text-red-500">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 h-11 rounded-full bg-accent px-5 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create forum"}
      </button>
    </form>
  );
}
