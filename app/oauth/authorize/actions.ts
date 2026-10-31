"use server";

import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { activateSavedAccount, getActiveSession, upsertAccount } from "@/lib/accountSwitcher";
import {
  createAuthorizationCode,
  getOAuthClient,
  isValidCodeChallenge,
  normalizeScope,
  recordGrant,
  withQueryParams,
} from "@/lib/oauth";

/**
 * Both actions re-validate client_id/redirect_uri themselves rather than
 * trusting the hidden form fields — the consent page already checked them,
 * but this is the point where an invalid pair would otherwise turn into an
 * actual redirect, so it's checked again right before that happens.
 */
async function validated(formData: FormData) {
  const clientId = String(formData.get("client_id") ?? "");
  const redirectUri = String(formData.get("redirect_uri") ?? "");
  const client = await getOAuthClient(clientId);
  if (!client || !client.redirectUris.includes(redirectUri)) {
    throw new Error("Invalid authorization request.");
  }
  return {
    clientId,
    redirectUri,
    // Re-normalized so a tampered hidden field can't add a scope this app may not have.
    scope: normalizeScope(String(formData.get("scope") ?? "profile"), client),
    state: String(formData.get("state") ?? ""),
    // PKCE (S256): checked again here, and bound into the code (see lib/oauth.ts).
    codeChallenge: challengeFrom(formData),
  };
}

/** The Allow form's code_challenge: none, or a valid S256 one. Anything else is refused, never silently dropped. */
function challengeFrom(formData: FormData): string | null {
  const value = String(formData.get("code_challenge") ?? "");
  if (!value) return null;
  if (!isValidCodeChallenge(value)) throw new Error("Invalid authorization request.");
  return value;
}

export async function approveAuthorizationAction(formData: FormData): Promise<void> {
  const session = await auth();
  const { clientId, redirectUri, scope, state, codeChallenge } = await validated(formData);
  if (!session?.user?.id) {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope,
      state,
    });
    if (codeChallenge) {
      params.set("code_challenge", codeChallenge);
      params.set("code_challenge_method", "S256");
    }
    redirect(`/sign-in?next=${encodeURIComponent(`/oauth/authorize?${params}`)}`);
  }

  await recordGrant(session.user.id, clientId, scope);
  const code = await createAuthorizationCode(clientId, session.user.id, redirectUri, scope, codeChallenge);
  redirect(withQueryParams(redirectUri, { code, state }));
}

export async function denyAuthorizationAction(formData: FormData): Promise<void> {
  const { redirectUri, state } = await validated(formData);
  redirect(withQueryParams(redirectUri, { error: "access_denied", state }));
}

/** Only ever send people back to the consent page itself. */
function safeReturnTo(formData: FormData): string {
  const value = String(formData.get("return_to") ?? "");
  return value.startsWith("/oauth/authorize?") ? value : "/";
}

/** Saves the current account in the switcher, so it's still there after switching away. */
async function keepCurrentAccount(): Promise<void> {
  const current = await auth();
  const token = (await getActiveSession())?.value;
  if (current?.user?.id && current.user.name && token) {
    await upsertAccount(current.user.id, current.user.name, token);
  }
}

/** "Switch account" on the consent page: becomes a saved account, then shows the consent page again. */
export async function switchOAuthAccountAction(formData: FormData): Promise<void> {
  const returnTo = safeReturnTo(formData);
  const targetId = String(formData.get("account_id") ?? "");
  await keepCurrentAccount();
  await activateSavedAccount(targetId);
  redirect(returnTo);
}

/** "Use another account": keeps this one saved, signs out, and signs in again, coming back here. */
export async function signInWithAnotherAccountAction(formData: FormData): Promise<void> {
  const returnTo = safeReturnTo(formData);
  await keepCurrentAccount();
  await signOut({ redirectTo: `/sign-in?next=${encodeURIComponent(returnTo)}` });
}
