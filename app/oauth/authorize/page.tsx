import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  describeScope,
  getOAuthClient,
  hasGrant,
  isOfficialClient,
  isValidCodeChallenge,
  normalizeScope,
  withQueryParams,
} from "@/lib/oauth";
import {
  approveAuthorizationAction,
  denyAuthorizationAction,
  switchOAuthAccountAction,
  signInWithAnotherAccountAction,
} from "./actions";
import { Avatar } from "@/components/Avatar";
import { readSavedAccounts } from "@/lib/accountSwitcher";
import { displayNameOf } from "@/lib/format";
import { getAvatarUrlsByIds, getStoredUserById } from "@/lib/store";

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

  // PKCE: only S256, and only a well-formed challenge (see lib/oauth.ts).
  const codeChallenge = sp.code_challenge ?? "";
  if (codeChallenge && ((sp.code_challenge_method ?? "plain") !== "S256" || !isValidCodeChallenge(codeChallenge))) {
    redirect(withQueryParams(redirectUri, {
      error: "invalid_request",
      error_description: "code_challenge must be S256: base64url(sha256(code_verifier)), 43 characters.",
      state,
    }));
  }

  const session = await auth();
  if (!session?.user?.id) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) if (value) params.set(key, value);
    params.set("response_type", "code");
    params.set("scope", scope);
    redirect(`/sign-in?next=${encodeURIComponent(`/oauth/authorize?${params}`)}`);
  }

  // Always ask, even for Jace's own apps and apps you've approved before,
  // so you can see which account and what access each sign-in uses.
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) if (value) params.set(key, value);
  params.set("response_type", "code");
  params.set("scope", scope);
  const returnTo = `/oauth/authorize?${params}`;

  const userId = session.user.id;
  const [me, saved] = await Promise.all([getStoredUserById(userId), readSavedAccounts()]);
  const others = saved.filter((a) => a.id !== userId);
  const otherAvatars = await getAvatarUrlsByIds(others.map((a) => a.id));
  const name = me ? displayNameOf(me) : (session.user.name ?? "you");
  const official = isOfficialClient(client);
  const approvedBefore = await hasGrant(userId, clientId, scope);

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-5 px-6 py-10">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-accent">Sign in with Jace</p>
        <h1 className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
          {client.name}
          {official && (
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">Official Jace app</span>
          )}
        </h1>
        <p className="mt-1 text-sm text-muted">
          wants to sign in with your Jace account.
          {approvedBefore && " You've allowed this before."}
        </p>
      </div>

      <div className="rounded-2xl border border-line bg-panel p-4">
        <p className="text-xs font-medium text-muted">Signing in as</p>
        <div className="mt-2 flex items-center gap-3">
          <Avatar name={name} imageUrl={me?.imageUrl} size={44} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{name}</p>
            <p className="truncate text-sm text-muted">@{me?.username ?? session.user.name}</p>
          </div>
        </div>
        <details className="group mt-3">
          <summary className="cursor-pointer list-none text-sm font-medium text-accent hover:underline">
            Switch account
          </summary>
          <div className="mt-3 flex flex-col gap-2">
            {others.map((account) => (
              <form key={account.id} action={switchOAuthAccountAction}>
                <input type="hidden" name="account_id" value={account.id} />
                <input type="hidden" name="return_to" value={returnTo} />
                <button
                  type="submit"
                  className="flex w-full items-center gap-3 rounded-xl border border-line px-3 py-2 text-left transition-colors hover:bg-foreground/[.05]"
                >
                  <Avatar name={account.username} imageUrl={otherAvatars.get(account.id)} size={32} />
                  <span className="truncate text-sm font-medium">@{account.username}</span>
                </button>
              </form>
            ))}
            <form action={signInWithAnotherAccountAction}>
              <input type="hidden" name="return_to" value={returnTo} />
              <button
                type="submit"
                className="w-full rounded-xl border border-dashed border-line px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-foreground/[.05]"
              >
                + Use another account
              </button>
            </form>
            <p className="text-xs text-muted">
              Accounts you&apos;ve saved in the account switcher show up here. &quot;Use another
              account&quot; keeps this one saved, so you can switch back.
            </p>
          </div>
        </details>
      </div>

      <div className="rounded-2xl border border-line bg-panel p-4">
        <p className="text-sm font-medium">This will let {client.name}:</p>
        <ul className="mt-2 flex flex-col gap-1.5 text-sm text-muted">
          {describeScope(scope).map((line) => (
            <li key={line} className="flex gap-2">
              <span aria-hidden="true" className="text-accent">✓</span>
              {line}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">
          You can disconnect {client.name} any time under Manage account → Connected apps.
        </p>
      </div>

      <div className="flex gap-3">
        <form action={approveAuthorizationAction} className="flex-1">
          <input type="hidden" name="client_id" value={clientId} />
          <input type="hidden" name="redirect_uri" value={redirectUri} />
          <input type="hidden" name="scope" value={scope} />
          <input type="hidden" name="state" value={state} />
          <input type="hidden" name="code_challenge" value={codeChallenge} />
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
            className="h-11 w-full rounded-full border border-line px-4 text-sm font-medium transition-colors hover:bg-foreground/[.05]"
          >
            Deny
          </button>
        </form>
      </div>
    </div>
  );
}
