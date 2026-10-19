"use client";

import { useActionState, useState, useTransition } from "react";
import {
  createOAuthAppAction,
  deleteOAuthAppAction,
  regenerateOAuthSecretAction,
} from "@/app/account/apps/actions";
import type { OAuthClient } from "@/lib/types";

function SecretReveal({ clientId, secret }: { clientId: string; secret: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
      <p className="font-medium text-amber-700 dark:text-amber-400">
        Copy this secret now — it won&apos;t be shown again.
      </p>
      <p className="font-mono">
        client_id: <span className="break-all">{clientId}</span>
      </p>
      <p className="font-mono">
        client_secret: <span className="break-all">{secret}</span>
      </p>
    </div>
  );
}

function AppRow({ app }: { app: OAuthClient }) {
  const [deleted, setDeleted] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (deleted) return null;

  function regenerate() {
    if (!confirm(`Regenerate ${app.name}'s secret? The old one stops working immediately.`)) return;
    startTransition(async () => {
      const result = await regenerateOAuthSecretAction(app.id);
      if (result.error) setError(result.error);
      else setNewSecret(result.secret ?? null);
    });
  }

  function remove() {
    if (!confirm(`Delete ${app.name}? Anyone signed in through it will be signed out.`)) return;
    startTransition(async () => {
      await deleteOAuthAppAction(app.id);
      setDeleted(true);
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-line p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium">
          {app.name}
          {app.official && (
            <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">
              Official
            </span>
          )}
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={regenerate}
            disabled={isPending}
            className="h-8 rounded-full border border-line px-3 text-xs font-medium transition-colors hover:bg-black/[.03] disabled:opacity-50 dark:hover:bg-white/[.05]"
          >
            Regenerate secret
          </button>
          <button
            onClick={remove}
            disabled={isPending}
            className="h-8 rounded-full border border-red-500 px-3 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>
      <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
        client_id: <span className="break-all">{app.id}</span>
      </p>
      <div className="text-xs text-zinc-500 dark:text-zinc-400">
        Redirect URIs:
        <ul className="mt-0.5 list-inside list-disc">
          {app.redirectUris.map((u) => (
            <li key={u} className="break-all font-mono">
              {u}
            </li>
          ))}
        </ul>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      {newSecret && <SecretReveal clientId={app.id} secret={newSecret} />}
    </div>
  );
}

export function OAuthAppsManager({ apps }: { apps: OAuthClient[] }) {
  const [state, formAction, pending] = useActionState(createOAuthAppAction, {});

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold">Your apps</h2>

      {apps.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No apps registered yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {apps.map((app) => (
            <AppRow key={app.id} app={app} />
          ))}
        </div>
      )}

      {state.secret && state.clientId && (
        <SecretReveal clientId={state.clientId} secret={state.secret} />
      )}

      <form action={formAction} className="flex flex-col gap-3 rounded-md border border-line p-3">
        <h3 className="text-sm font-semibold">Register a new app</h3>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className="text-xs font-medium">
            Name
          </label>
          <input
            id="name"
            name="name"
            required
            maxLength={80}
            placeholder="My website"
            className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="redirectUris" className="text-xs font-medium">
            Redirect URIs (one per line)
          </label>
          <textarea
            id="redirectUris"
            name="redirectUris"
            required
            rows={3}
            placeholder={"https://example.com/api/auth/callback/jace"}
            className="rounded-lg border border-line bg-background px-3 py-2 font-mono text-xs outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </div>
        {state.error && <p className="text-xs text-red-500">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="h-9 w-fit rounded-full bg-accent px-4 text-xs font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create app"}
        </button>
      </form>
    </div>
  );
}
