import "server-only";
import { headers } from "next/headers";
import { JACE_BROWSER_CLIENT_ID } from "./constants";
import { sql } from "./db";
import { getAccessTokenSession } from "./oauth";
import { getStoredUserById } from "./store";
import { generateToken, hashToken } from "./tokens";

/**
 * Jace Browser signs you in to Jace websites (okjace/jace-browser):
 *
 * 1. This site: the browser POSTs its access token to
 *    /api/oauth/browser-session, which mints a one-time handoff code and
 *    signs the browser in with it (the "browserHandoff" credential in
 *    auth.ts). Only Jace Browser's own tokens work, and only with the
 *    X-Jace-Browser header, so a web page can't log you in to someone
 *    else's account with a form post.
 *
 * 2. Jace's own apps: when an official app sends you to /oauth/authorize,
 *    Jace Browser adds X-Jace-Browser-Token (only on requests to this
 *    site's /oauth/authorize). If it's a valid Jace Browser token for the
 *    account that's signed in here, the consent screen is skipped - Jace
 *    Browser's own consent screen asked for exactly that.
 */

export const BROWSER_TOKEN_HEADER = "x-jace-browser-token";
const HANDOFF_TTL_MS = 60 * 1000;

/** The account a Jace Browser access token signs in, or null. */
export async function jaceBrowserUser(token: string | null | undefined): Promise<{ userId: string } | null> {
  if (!token) return null;
  const session = await getAccessTokenSession(token);
  if (!session || session.clientId !== JACE_BROWSER_CLIENT_ID) return null;
  if (!session.scope.split(" ").includes("profile")) return null;
  const user = await getStoredUserById(session.userId);
  if (!user || user.banned) return null;
  return { userId: user.id };
}

/** The Jace Browser account behind this request's X-Jace-Browser-Token header, if any. */
export async function jaceBrowserUserFromRequestHeaders(): Promise<{ userId: string } | null> {
  const value = (await headers()).get(BROWSER_TOKEN_HEADER);
  return jaceBrowserUser(value?.trim());
}

export async function createBrowserHandoff(userId: string): Promise<string> {
  const code = generateToken();
  const now = Date.now();
  await sql`DELETE FROM browser_handoffs WHERE expires_at < ${new Date(now).toISOString()}`;
  await sql`
    INSERT INTO browser_handoffs (code_hash, user_id, expires_at)
    VALUES (${hashToken(code)}, ${userId}, ${new Date(now + HANDOFF_TTL_MS).toISOString()})
  `;
  return code;
}

/** Single use: returns the user id and deletes the code. */
export async function consumeBrowserHandoff(code: string): Promise<string | null> {
  const rows = await sql`
    DELETE FROM browser_handoffs
    WHERE code_hash = ${hashToken(code)} AND expires_at > ${new Date().toISOString()}
    RETURNING user_id
  `;
  return (rows[0]?.user_id as string) ?? null;
}
