"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  createAuthorizationCode,
  getOAuthClient,
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
  };
}

export async function approveAuthorizationAction(formData: FormData): Promise<void> {
  const session = await auth();
  const { clientId, redirectUri, scope, state } = await validated(formData);
  if (!session?.user?.id) {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope,
      state,
    });
    redirect(`/sign-in?next=${encodeURIComponent(`/oauth/authorize?${params}`)}`);
  }

  await recordGrant(session.user.id, clientId, scope);
  const code = await createAuthorizationCode(clientId, session.user.id, redirectUri, scope);
  redirect(withQueryParams(redirectUri, { code, state }));
}

export async function denyAuthorizationAction(formData: FormData): Promise<void> {
  const { redirectUri, state } = await validated(formData);
  redirect(withQueryParams(redirectUri, { error: "access_denied", state }));
}
