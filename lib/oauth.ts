import "server-only";
import { randomUUID } from "crypto";
import { ROOT_ADMIN_ID } from "./constants";
import { sql } from "./db";
import { generateToken, hashToken } from "./tokens";
import type { OAuthClient, OAuthGrant } from "./types";

/**
 * "Sign in with Jace": a minimal OAuth 2.0 authorization-code provider so
 * other websites can let people sign in with their Jace account, the same
 * shape as "Sign in with GitHub" elsewhere in this app but in the other
 * direction. Flow: app/oauth/authorize (browser, shows consent) issues a
 * short-lived code -> the other site's server exchanges it for an access
 * token at app/api/oauth/token -> that token reads app/api/oauth/userinfo.
 *
 * This is plain OAuth 2.0, not full OpenID Connect: there's no ID token, no
 * discovery document, and no JWKS. A generic/custom OAuth provider config
 * (most auth libraries have one) plugs into the three endpoints directly.
 *
 * Secrets, codes, and tokens are never stored raw — only a sha256 hash (see
 * lib/tokens.ts), the same pattern this app already uses for email and
 * sign-in links.
 */

export const ALLOWED_SCOPES = ["profile", "email", "scores", "videos", "messages"] as const;
export type OAuthScope = (typeof ALLOWED_SCOPES)[number];

/**
 * Scopes only official apps may get. "messages" reads and writes the user's
 * direct messages and group chats (see app/api/oauth/messages).
 */
const OFFICIAL_ONLY_SCOPES: readonly string[] = ["messages"];

/**
 * Official apps are the ones the site owner registered — Jace's own projects
 * (Jace Social, Jace Store, …). They still get the consent screen, can ask for the
 * "messages" scope, and can use the moderation API with their client secret
 * (see lib/integration.ts).
 */
export function isOfficialClient(client: Pick<OAuthClient, "ownerId">): boolean {
  return client.ownerId === ROOT_ADMIN_ID;
}

const MAX_APPS_PER_USER = 10;
const CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes — just long enough for a redirect + server exchange
const TOKEN_TTL_DAYS = 365;

/**
 * Normalizes a requested scope string into a sorted, deduped, space-joined one — always including "profile".
 * Official-only scopes are dropped for any other client.
 */
export function normalizeScope(
  raw: string | null | undefined,
  client?: Pick<OAuthClient, "ownerId"> | null,
): string {
  const requested = (raw ?? "").split(/[\s,]+/).filter(Boolean);
  const kept = new Set<string>(["profile"]);
  const official = !!client && isOfficialClient(client);
  for (const s of requested) {
    if (!(ALLOWED_SCOPES as readonly string[]).includes(s)) continue;
    if (OFFICIAL_ONLY_SCOPES.includes(s) && !official) continue;
    kept.add(s);
  }
  return [...kept].sort().join(" ");
}

/** https, or http on localhost/127.0.0.1 for local development. */
export function isValidRedirectUri(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    return (
      url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}

function rowToClient(row: Record<string, unknown>): OAuthClient {
  return {
    id: row.id as string,
    name: row.name as string,
    ownerId: row.owner_id as string,
    redirectUris: (row.redirect_uris as string[]) ?? [],
    official: row.owner_id === ROOT_ADMIN_ID,
    webhookUrl: (row.webhook_url as string) ?? undefined,
    createdAt: row.created_at as string,
  };
}

export async function createOAuthApp(
  ownerId: string,
  name: string,
  redirectUris: string[],
): Promise<{ client: OAuthClient; secret: string } | { error: string }> {
  const trimmedName = name.trim().slice(0, 80);
  if (trimmedName.length < 2) return { error: "Name must be at least 2 characters." };

  const uris = [...new Set(redirectUris.map((u) => u.trim()).filter(Boolean))].slice(0, 10);
  if (uris.length === 0) return { error: "Add at least one redirect URI." };
  const bad = uris.find((u) => !isValidRedirectUri(u));
  if (bad) {
    return {
      error: `"${bad}" isn't a valid redirect URI — use https://, or http://localhost while developing.`,
    };
  }

  const existing = await sql`SELECT count(*) FROM oauth_clients WHERE owner_id = ${ownerId}`;
  if (Number(existing[0].count) >= MAX_APPS_PER_USER) {
    return { error: `You can only register up to ${MAX_APPS_PER_USER} apps.` };
  }

  const id = randomUUID();
  const secret = generateToken();
  const createdAt = new Date().toISOString();
  await sql`
    INSERT INTO oauth_clients (id, secret_hash, name, owner_id, redirect_uris, created_at)
    VALUES (${id}, ${hashToken(secret)}, ${trimmedName}, ${ownerId}, ${JSON.stringify(uris)}::jsonb, ${createdAt})
  `;
  return {
    client: { id, name: trimmedName, ownerId, redirectUris: uris, official: ownerId === ROOT_ADMIN_ID, createdAt },
    secret,
  };
}

export async function listOAuthAppsForUser(ownerId: string): Promise<OAuthClient[]> {
  const rows = await sql`SELECT * FROM oauth_clients WHERE owner_id = ${ownerId} ORDER BY created_at DESC`;
  return rows.map(rowToClient);
}

export async function getOAuthClient(id: string): Promise<OAuthClient | null> {
  const rows = await sql`SELECT * FROM oauth_clients WHERE id = ${id}`;
  return rows[0] ? rowToClient(rows[0]) : null;
}

/** Deletes an app (only its owner can) and immediately revokes everything issued for it. */
export async function deleteOAuthApp(id: string, ownerId: string): Promise<boolean> {
  const rows = await sql`DELETE FROM oauth_clients WHERE id = ${id} AND owner_id = ${ownerId} RETURNING id`;
  if (rows.length === 0) return false;
  await sql`DELETE FROM oauth_tokens WHERE client_id = ${id}`;
  await sql`DELETE FROM oauth_codes WHERE client_id = ${id}`;
  await sql`DELETE FROM oauth_grants WHERE client_id = ${id}`;
  return true;
}

/**
 * Sets (or with "", clears) an official app's webhook URL — only its owner
 * can, and only https. Jace POSTs { type: "user.updated", user_id, changed,
 * sent_at } there when one of the app's users changes their profile.
 */
export async function setOAuthWebhookUrl(id: string, ownerId: string, raw: string): Promise<{ error?: string }> {
  const value = raw.trim();
  if (value) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return { error: "That isn't a valid URL." };
    }
    if (url.protocol !== "https:" || value.length > 500) return { error: "Webhook URLs must be https:// (500 characters at most)." };
  }
  const client = await getOAuthClient(id);
  if (!client || client.ownerId !== ownerId) return { error: "You can only change your own apps." };
  if (!client.official) return { error: "Only Jace's official apps get profile webhooks." };
  await sql`UPDATE oauth_clients SET webhook_url = ${value || null} WHERE id = ${id} AND owner_id = ${ownerId}`;
  return {};
}

/** Issues a new secret for an existing app, invalidating the old one — only its owner can. */
export async function regenerateOAuthSecret(id: string, ownerId: string): Promise<string | null> {
  const secret = generateToken();
  const rows = await sql`
    UPDATE oauth_clients SET secret_hash = ${hashToken(secret)}
    WHERE id = ${id} AND owner_id = ${ownerId}
    RETURNING id
  `;
  return rows.length > 0 ? secret : null;
}

/** Validates a client_id/client_secret pair (from the token endpoint) and returns the client if it matches. */
export async function verifyOAuthClientSecret(
  clientId: string,
  secret: string,
): Promise<OAuthClient | null> {
  const rows = await sql`
    SELECT * FROM oauth_clients WHERE id = ${clientId} AND secret_hash = ${hashToken(secret)}
  `;
  return rows[0] ? rowToClient(rows[0]) : null;
}

export async function createAuthorizationCode(
  clientId: string,
  userId: string,
  redirectUri: string,
  scope: string,
): Promise<string> {
  const code = generateToken();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
  await sql`
    INSERT INTO oauth_codes (code_hash, client_id, user_id, redirect_uri, scope, expires_at, created_at)
    VALUES (${hashToken(code)}, ${clientId}, ${userId}, ${redirectUri}, ${scope}, ${expiresAt}, ${new Date().toISOString()})
  `;
  return code;
}

/**
 * Consumes (deletes) a code in one step, whether or not it turns out to be
 * valid — a code must never be usable twice, including an expired one that
 * matched, so we don't want a separate "check, then delete" race.
 */
export async function consumeAuthorizationCode(
  code: string,
  clientId: string,
  redirectUri: string,
): Promise<{ userId: string; scope: string } | null> {
  const rows = await sql`
    DELETE FROM oauth_codes
    WHERE code_hash = ${hashToken(code)} AND client_id = ${clientId} AND redirect_uri = ${redirectUri}
    RETURNING user_id, scope, expires_at
  `;
  const row = rows[0];
  if (!row) return null;
  if (new Date(row.expires_at as string).getTime() < Date.now()) return null;
  return { userId: row.user_id as string, scope: row.scope as string };
}

export async function issueAccessToken(
  clientId: string,
  userId: string,
  scope: string,
): Promise<{ token: string; expiresInSeconds: number }> {
  const token = generateToken();
  const expiresInSeconds = TOKEN_TTL_DAYS * 24 * 60 * 60;
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
  await sql`
    INSERT INTO oauth_tokens (token_hash, client_id, user_id, scope, expires_at, created_at)
    VALUES (${hashToken(token)}, ${clientId}, ${userId}, ${scope}, ${expiresAt}, ${new Date().toISOString()})
  `;
  return { token, expiresInSeconds };
}

export async function getAccessTokenSession(
  token: string,
): Promise<{ userId: string; clientId: string; scope: string } | null> {
  const rows = await sql`
    SELECT user_id, client_id, scope FROM oauth_tokens
    WHERE token_hash = ${hashToken(token)} AND expires_at > ${new Date().toISOString()}
  `;
  const row = rows[0];
  if (!row) return null;
  return { userId: row.user_id as string, clientId: row.client_id as string, scope: row.scope as string };
}

export async function hasGrant(userId: string, clientId: string, scope: string): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM oauth_grants WHERE user_id = ${userId} AND client_id = ${clientId} AND scope = ${scope}
  `;
  return rows.length > 0;
}

export async function recordGrant(userId: string, clientId: string, scope: string): Promise<void> {
  await sql`
    INSERT INTO oauth_grants (user_id, client_id, scope, created_at)
    VALUES (${userId}, ${clientId}, ${scope}, ${new Date().toISOString()})
    ON CONFLICT (user_id, client_id) DO UPDATE SET scope = EXCLUDED.scope
  `;
}

export async function listGrantsForUser(userId: string): Promise<OAuthGrant[]> {
  const rows = await sql`
    SELECT g.client_id, g.scope, g.created_at, c.name AS client_name
    FROM oauth_grants g JOIN oauth_clients c ON c.id = g.client_id
    WHERE g.user_id = ${userId}
    ORDER BY g.created_at DESC
  `;
  return rows.map((r) => ({
    clientId: r.client_id as string,
    clientName: r.client_name as string,
    scope: r.scope as string,
    createdAt: r.created_at as string,
  }));
}

/** "Disconnect" from Account settings — removes the grant and revokes every token that app holds for this user. */
export async function revokeGrant(userId: string, clientId: string): Promise<void> {
  await sql`DELETE FROM oauth_grants WHERE user_id = ${userId} AND client_id = ${clientId}`;
  await sql`DELETE FROM oauth_tokens WHERE user_id = ${userId} AND client_id = ${clientId}`;
}

/** Adds/overwrites query params on a redirect URI — used to send `code`/`state` or `error`/`state` back to the client's app. */
export function withQueryParams(uri: string, params: Record<string, string | undefined>): string {
  const url = new URL(uri);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}

const SCOPE_LABELS: Record<string, string> = {
  profile: "Your username and avatar",
  email: "Your email address",
  scores: "Your game scores and the leaderboards",
  videos: "Your videos, including private and unlisted ones",
  messages: "Your messages and group chats, and send messages for you",
};

/** Human-readable lines for the consent screen, in a fixed order. */
export function describeScope(scope: string): string[] {
  const parts = scope.split(" ");
  return ALLOWED_SCOPES.filter((s) => parts.includes(s)).map((s) => SCOPE_LABELS[s]);
}
