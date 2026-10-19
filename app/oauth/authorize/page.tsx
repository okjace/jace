import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  createAuthorizationCode,
  describeScope,
  getOAuthClient,
  hasGrant,
  isOfficialClient,
  normalizeScope,
  recordGrant,
  withQueryParams,
} from "@/lib/oauth";
import {
  approveAuthorizationAction,
  denyAuthorizationAction,
} from "./actions";

function ErrorNotice({ children }: { children: string }) {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-3 px-6 py-10 text-center">
      <h1 className="text-lg font-semibold text-red-500">Can&apos;t sign in</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{children}</p>
    </div>
  );
}

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const clientId = sp.client_id;
  const redirectUri = sp.redirect_uri;
  const state = sp.state ?? "";

  // A missing/unknown client_id or an unregistered redirect_uri can't be
  // reported back to the app — following an unregistered redirect_uri is
  // exactly the hole this whole check exists to close — so these show a
  // plain page instead of ever redirecting.
  if (!clientId || !redirectUri) {
    return <ErrorNotice>This link is missing information and can&apos;t be used.</ErrorNotice>;
  }
  const client = await getOAuthClient(clientId);
  if (!client) {
    return <ErrorNotice>This app isn&apos;t registered with Jace.</ErrorNotice>;
  }
  if (!client.redirectUris.includes(redirectUri)) {
    return (
      <ErrorNotice>
        This app tried to sign in through a web address it hasn&apos;t registered with Jace.
      </ErrorNotice>
    );
  }

  const scope = normalizeScope(sp.scope, client);

  // Past this point client_id + redirect_uri are trusted, so errors can be
  // reported back to the app instead of shown here.
  if (sp.response_type !== "code") {
    redirect(withQueryParams(redirectUri, { error: "unsupported_response_type", state }));
  }

  const session = await auth();
  if (!session?.user?.id) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) if (value) params.set(key, value);
    params.set("response_type", "code");
    params.set("scope", scope);
    redirect(`/sign-in?next=${encodeURIComponent(`/oauth/authorize?${params}`)}`);
  }

  // Skip the consent screen if this exact scope was already approved —
  // matches how other "Sign in with X" providers behave — and always for
  // Jace's own apps, so moving between them is seamless. The grant is still
  // recorded, so it shows (and can be disconnected) under Connected apps.
  if (isOfficialClient(client) || (await hasGrant(session.user.id, clientId, scope))) {
    await recordGrant(session.user.id, clientId, scope);
    const code = await createAuthorizationCode(clientId, session.user.id, redirectUri, scope);
    redirect(withQueryParams(redirectUri, { code, state }));
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-10">
      <div>
        <h1 className="text-xl font-semibold">{client.name}</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          wants to sign in with your Jace account ({session.user.name}).
        </p>
      </div>

      <div className="rounded-lg border border-black/10 p-4 dark:border-white/15">
        <p className="text-sm font-medium">This will let {client.name} see:</p>
        <ul className="mt-2 list-inside list-disc text-sm text-zinc-600 dark:text-zinc-400">
          {describeScope(scope).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      <div className="flex gap-3">
        <form action={approveAuthorizationAction} className="flex-1">
          <input type="hidden" name="client_id" value={clientId} />
          <input type="hidden" name="redirect_uri" value={redirectUri} />
          <input type="hidden" name="scope" value={scope} />
          <input type="hidden" name="state" value={state} />
          <button
            type="submit"
            className="h-11 w-full rounded-full bg-accent px-4 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover"
          >
            Allow
          </button>
        </form>
        <form action={denyAuthorizationAction} className="flex-1">
          <input type="hidden" name="client_id" value={clientId} />
          <input type="hidden" name="redirect_uri" value={redirectUri} />
          <input type="hidden" name="state" value={state} />
          <button
            type="submit"
            className="h-11 w-full rounded-full border border-black/10 px-4 text-sm font-medium transition-colors hover:bg-black/[.03] dark:border-white/15 dark:hover:bg-white/[.05]"
          >
            Deny
          </button>
        </form>
      </div>

      <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
        Not you?{" "}
        <Link href="/api/auth/signout" className="underline underline-offset-2">
          Sign out
        </Link>{" "}
        first.
      </p>
    </div>
  );
}
