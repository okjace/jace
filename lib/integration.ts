import "server-only";
import { createHash, randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { sql } from "./db";
import { getAccessTokenSession, getOAuthClient, isOfficialClient, verifyOAuthClientSecret } from "./oauth";
import { canActAsOrg, getPostBlockReason } from "./permissions";
import { isRootAdmin, SUPPORT_ORG_ID } from "./constants";
import { uploadFile } from "./storage";
import {
  banUser,
  changeUsername,
  dmConversationId,
  getGroupChat,
  getOrgById,
  getStoredUserById,
  getUserByUsername,
  isAdmin,
  isUsernameTaken,
  listDmConversations,
  listDmMessages,
  listGroupChatMessages,
  listGroupChatsForUser,
  setUserImageUrl,
  unbanUser,
} from "./store";
import type { OAuthClient, OrgRecord, StoredUser } from "./types";

/**
 * The API Jace's own apps (Jace Social, Jace Store, Jace Launcher, …) use to
 * share accounts with Jace: reading and writing a user's messages with a
 * user access token that has the "messages" scope, and banning or unbanning
 * accounts with an official app's client secret, and reading game scores
 * and leaderboards (any app) or saving scores (official apps) with the
 * "scores" scope. Routes live under app/api/oauth/messages,
 * app/api/oauth/moderation, app/api/oauth/scores, and
 * app/api/oauth/leaderboard, plus app/api/oauth/profile (official apps change
 * the user's username and picture); the developer docs are app/developers.
 */

export const MAX_MESSAGE_LENGTH = 4000;

function apiError(error: string, description: string, status: number): NextResponse {
  return NextResponse.json({ error, error_description: description }, { status });
}

export type MessagesCaller = { user: StoredUser; client: OAuthClient };

/** Checks the request's Bearer token has the "messages" scope; returns the user it acts for, or an error response. */
export async function authorizeMessages(request: Request): Promise<MessagesCaller | NextResponse> {
  const header = request.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (!token) return apiError("invalid_request", "Missing bearer token.", 401);
  const session = await getAccessTokenSession(token);
  if (!session) return apiError("invalid_token", "That token is invalid or expired.", 401);
  if (!session.scope.split(" ").includes("messages")) {
    return apiError("insufficient_scope", 'This token needs the "messages" scope.', 403);
  }
  const [user, client] = await Promise.all([
    getStoredUserById(session.userId),
    getOAuthClient(session.clientId),
  ]);
  if (!user || !client) return apiError("invalid_token", "Account or app no longer exists.", 401);
  // The scope is official-only; re-check in case the app changed hands.
  if (!isOfficialClient(client)) return apiError("insufficient_scope", "Only Jace's own apps can use messages.", 403);
  if (user.banned) return apiError("account_banned", "This Jace account is banned.", 403);
  return { user, client };
}

export type ScoresCaller = { user: StoredUser; client: OAuthClient; official: boolean };

/**
 * Checks the request's Bearer token has the "scores" scope; returns the user
 * it acts for, or an error response (the codes Jace Games expects: 401
 * invalid_token, 403 insufficient_scope, 403 account_banned). Any app the
 * person approved can read; `official` says whether it may also write.
 */
export async function authorizeScores(request: Request): Promise<ScoresCaller | NextResponse> {
  const header = request.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (!token) return apiError("invalid_token", "Missing bearer token.", 401);
  const session = await getAccessTokenSession(token);
  if (!session) return apiError("invalid_token", "That token is invalid or expired.", 401);
  if (!session.scope.split(" ").includes("scores")) {
    return apiError("insufficient_scope", 'This token needs the "scores" scope.', 403);
  }
  const [user, client] = await Promise.all([
    getStoredUserById(session.userId),
    getOAuthClient(session.clientId),
  ]);
  if (!user || !client) return apiError("invalid_token", "Account or app no longer exists.", 401);
  if (user.banned) return apiError("account_banned", "This Jace account is banned.", 403);
  return { user, client, official: isOfficialClient(client) };
}

const GAME_ID = /^[a-z0-9-]{1,32}$/;
export const MAX_SCORES_PER_REQUEST = 500;
const MAX_SCORE = 2_147_483_647; // the scores.score column is a Postgres INTEGER

export type ScoreSubmission = { game: string; score: number; createdAt: string; externalId: string | null };

/**
 * Reads a POST body as either one score ({ game, score }) or a batch
 * ({ scores: [{ game, score, created_at, external_id }] }). Any invalid
 * item rejects the whole request, so nothing is half-imported.
 */
export function parseScoreSubmission(body: Record<string, unknown>): ScoreSubmission[] | { error: string } {
  const list: unknown[] = Array.isArray(body.scores) ? body.scores : body.scores === undefined ? [body] : [];
  if (body.scores !== undefined && !Array.isArray(body.scores)) return { error: "scores must be an array." };
  if (list.length > MAX_SCORES_PER_REQUEST) {
    return { error: `Send at most ${MAX_SCORES_PER_REQUEST} scores per request.` };
  }
  const items: ScoreSubmission[] = [];
  for (const [index, raw] of list.entries()) {
    const at = list.length > 1 || Array.isArray(body.scores) ? ` (scores[${index}])` : "";
    if (!raw || typeof raw !== "object") return { error: `Each score must be an object${at}.` };
    const item = raw as Record<string, unknown>;
    if (typeof item.game !== "string" || !GAME_ID.test(item.game)) {
      return { error: `game must match ^[a-z0-9-]{1,32}$${at}.` };
    }
    if (typeof item.score !== "number" || !Number.isInteger(item.score) || item.score < 0 || item.score > MAX_SCORE) {
      return { error: `score must be a whole number, 0 or more${at}.` };
    }
    const createdAt = messageTime(item.created_at);
    if (typeof createdAt !== "string") return { error: `${createdAt.error}${at}` };
    let externalId: string | null = null;
    if (item.external_id !== undefined && item.external_id !== null) {
      if (typeof item.external_id !== "string" || !item.external_id.trim() || item.external_id.length > 200) {
        return { error: `external_id must be a non-empty string of up to 200 characters${at}.` };
      }
      externalId = item.external_id;
    }
    items.push({ game: item.game, score: item.score, createdAt, externalId });
  }
  return items;
}

/** Reads client_id/client_secret from HTTP Basic auth or the JSON body; only official apps pass. */
export async function authorizeOfficialClient(
  request: Request,
  body: Record<string, unknown>,
): Promise<OAuthClient | NextResponse> {
  let id = typeof body.client_id === "string" ? body.client_id : undefined;
  let secret = typeof body.client_secret === "string" ? body.client_secret : undefined;
  const header = request.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const sep = decoded.indexOf(":");
    if (sep > 0) {
      id = decoded.slice(0, sep);
      secret = decoded.slice(sep + 1);
    }
  }
  if (!id || !secret) return apiError("invalid_client", "client_id and client_secret are required.", 401);
  const client = await verifyOAuthClientSecret(id, secret);
  if (!client) return apiError("invalid_client", "Unknown client_id/client_secret.", 401);
  if (!isOfficialClient(client)) {
    return apiError("unauthorized_client", "Only Jace's own apps can use the moderation API.", 403);
  }
  return client;
}

/**
 * A stable message id for an app-supplied external id, so syncing the same
 * message twice (or re-running an import) never makes a duplicate.
 */
function importedMessageId(clientId: string, externalId: string): string {
  const digest = createHash("sha256").update(`${clientId}:${externalId}`).digest("hex").slice(0, 32);
  return `app-${digest}`;
}

/** An imported message keeps its original time, as long as that isn't in the future. */
function messageTime(value: unknown): string | { error: string } {
  if (value === undefined || value === null || value === "") return new Date().toISOString();
  const time = Date.parse(String(value));
  if (Number.isNaN(time)) return { error: "created_at must be an ISO 8601 date." };
  if (time > Date.now() + 60_000) return { error: "created_at can't be in the future." };
  return new Date(time).toISOString();
}

export type IncomingMessage = { body?: unknown; created_at?: unknown; external_id?: unknown };

function validateIncoming(
  input: IncomingMessage,
): { body: string; createdAt: string; externalId?: string } | { error: string } {
  const body = typeof input.body === "string" ? input.body.trim() : "";
  if (!body) return { error: "body is required." };
  if (body.length > MAX_MESSAGE_LENGTH) return { error: `body must be ${MAX_MESSAGE_LENGTH} characters or fewer.` };
  const createdAt = messageTime(input.created_at);
  if (typeof createdAt !== "string") return createdAt;
  const externalId =
    typeof input.external_id === "string" && input.external_id.trim()
      ? input.external_id.trim().slice(0, 200)
      : undefined;
  return { body, createdAt, externalId };
}

// ---------- Messages ----------

export async function listConversationsFor(user: StoredUser) {
  const [dms, groups] = await Promise.all([listDmConversations(user.id), listGroupChatsForUser(user.id)]);
  return {
    direct: dms.map((c) => ({
      user_id: c.otherId,
      username: c.otherName,
      last_message: publicDm(c.lastMessage),
    })),
    groups: groups.map((g) => ({ id: g.id, name: g.name, member_ids: g.memberIds, created_at: g.createdAt })),
  };
}

function publicDm(m: { id: string; fromId: string; fromName: string; toId: string; body: string; createdAt: string }) {
  return { id: m.id, from_id: m.fromId, from_name: m.fromName, to_id: m.toId, body: m.body, created_at: m.createdAt };
}

function since<T extends { createdAt: string }>(messages: T[], value: string | null): T[] {
  return value ? messages.filter((m) => m.createdAt > value) : messages;
}

export async function readDirectMessages(user: StoredUser, otherId: string, sinceIso: string | null) {
  const messages = await listDmMessages(dmConversationId(user.id, otherId));
  return since(messages, sinceIso).map(publicDm);
}

export async function writeDirectMessages(
  caller: MessagesCaller,
  otherId: string,
  inputs: IncomingMessage[],
): Promise<{ imported: number; skipped: number } | { error: string; status: number }> {
  const block = await getPostBlockReason(caller.user.id, "send messages");
  if (block) return { error: block, status: 403 };
  const other = await getStoredUserById(otherId);
  if (!other) return { error: "No Jace account has that user_id.", status: 404 };
  if (other.id === caller.user.id) return { error: "You can't message yourself.", status: 400 };

  const conversationId = dmConversationId(caller.user.id, other.id);
  let imported = 0;
  for (const input of inputs) {
    const message = validateIncoming(input);
    if ("error" in message) return { error: message.error, status: 400 };
    const id = message.externalId ? importedMessageId(caller.client.id, message.externalId) : randomUUID();
    const rows = await sql`
      INSERT INTO dm_messages (id, conversation_id, from_id, from_name, to_id, to_name, body, created_at)
      VALUES (${id}, ${conversationId}, ${caller.user.id}, ${caller.user.username}, ${other.id}, ${other.username}, ${message.body}, ${message.createdAt})
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `;
    imported += rows.length;
  }
  return { imported, skipped: inputs.length - imported };
}

async function memberGroup(user: StoredUser, groupId: string) {
  const group = await getGroupChat(groupId);
  return group && group.memberIds.includes(user.id) ? group : null;
}

export async function readGroupMessages(user: StoredUser, groupId: string, sinceIso: string | null) {
  const group = await memberGroup(user, groupId);
  if (!group) return null;
  const messages = await listGroupChatMessages(group.id);
  return since(messages, sinceIso).map((m) => ({
    id: m.id,
    from_id: m.fromId,
    from_name: m.fromName,
    body: m.body,
    created_at: m.createdAt,
  }));
}

export async function writeGroupMessages(
  caller: MessagesCaller,
  groupId: string,
  inputs: IncomingMessage[],
): Promise<{ imported: number; skipped: number } | { error: string; status: number }> {
  const block = await getPostBlockReason(caller.user.id, "send messages");
  if (block) return { error: block, status: 403 };
  const group = await memberGroup(caller.user, groupId);
  if (!group) return { error: "No group chat with that id that this account is in.", status: 404 };

  let imported = 0;
  for (const input of inputs) {
    const message = validateIncoming(input);
    if ("error" in message) return { error: message.error, status: 400 };
    const id = message.externalId ? importedMessageId(caller.client.id, message.externalId) : randomUUID();
    const rows = await sql`
      INSERT INTO group_chat_messages (id, group_id, from_id, from_name, body, created_at)
      VALUES (${id}, ${group.id}, ${caller.user.id}, ${caller.user.username}, ${message.body}, ${message.createdAt})
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `;
    imported += rows.length;
  }
  return { imported, skipped: inputs.length - imported };
}

// ---------- Appeals ----------

/**
 * Appeals are the direct-message threads between muted or banned accounts
 * and the Jace Official org (SUPPORT_ORG_ID) — the one conversation a
 * restricted account can still use (see components/moderation). These
 * helpers let Jace Official's owner and admins read and answer them from an
 * official app such as Jace Social, the same people who can on the website
 * (`canActAsOrg`).
 */
export type AppealsCaller = MessagesCaller & { org: OrgRecord };

/** authorizeMessages, plus: the token's user must be able to act as Jace Official. */
export async function authorizeAppeals(request: Request): Promise<AppealsCaller | NextResponse> {
  const caller = await authorizeMessages(request);
  if (caller instanceof NextResponse) return caller;
  const org = await getOrgById(SUPPORT_ORG_ID);
  if (!org || !canActAsOrg(org, caller.user.id)) {
    return apiError("forbidden", "Only Jace Official's owner and admins can see appeals.", 403);
  }
  return { ...caller, org };
}

function appealStatus(user: StoredUser | null) {
  if (!user) return { status: "deleted" as const };
  return {
    status: user.banned ? ("banned" as const) : user.muted ? ("muted" as const) : ("active" as const),
    ban_reason: user.banReason ?? null,
    banned_at: user.bannedAt ?? null,
    mute_reason: user.muteReason ?? null,
    muted_at: user.mutedAt ?? null,
  };
}

/** Every appeal thread, newest activity first, with each person's current moderation status. */
export async function listAppeals() {
  const threads = await listDmConversations(SUPPORT_ORG_ID);
  const users = await Promise.all(threads.map((t) => getStoredUserById(t.otherId)));
  return threads.map((t, i) => ({
    user_id: t.otherId,
    username: users[i]?.username ?? t.otherName,
    picture: users[i]?.imageUrl ?? null,
    ...appealStatus(users[i]),
    last_message: publicDm(t.lastMessage),
  }));
}

/** One person's appeal thread with Jace Official, oldest first, or null if there isn't one. */
export async function readAppeal(userId: string, sinceIso: string | null) {
  const [messages, user] = await Promise.all([
    listDmMessages(dmConversationId(SUPPORT_ORG_ID, userId)),
    getStoredUserById(userId),
  ]);
  if (messages.length === 0) return null;
  return {
    user_id: userId,
    username: user?.username ?? messages[0].fromName,
    picture: user?.imageUrl ?? null,
    ...appealStatus(user),
    messages: since(messages, sinceIso).map(publicDm),
  };
}

/** Replies to an appeal as Jace Official (not as the staff member), like the website does. */
export async function replyToAppeal(
  caller: AppealsCaller,
  userId: string,
  inputs: IncomingMessage[],
): Promise<{ imported: number; skipped: number } | { error: string; status: number }> {
  const person = await getStoredUserById(userId);
  if (!person) return { error: "No Jace account has that user_id.", status: 404 };

  const conversationId = dmConversationId(SUPPORT_ORG_ID, person.id);
  let imported = 0;
  for (const input of inputs) {
    const message = validateIncoming(input);
    if ("error" in message) return { error: message.error, status: 400 };
    const id = message.externalId ? importedMessageId(caller.client.id, message.externalId) : randomUUID();
    const rows = await sql`
      INSERT INTO dm_messages (id, conversation_id, from_id, from_name, to_id, to_name, body, created_at)
      VALUES (${id}, ${conversationId}, ${caller.org.id}, ${caller.org.name}, ${person.id}, ${person.username}, ${message.body}, ${message.createdAt})
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `;
    imported += rows.length;
  }
  return { imported, skipped: inputs.length - imported };
}

/** Accepts one message ({ body, … }) or many ({ messages: [{ body, … }] }, up to 500 per request). */
export function incomingMessages(body: Record<string, unknown>): IncomingMessage[] | { error: string } {
  if (Array.isArray(body.messages)) {
    if (body.messages.length === 0) return { error: "messages is empty." };
    if (body.messages.length > 500) return { error: "Send at most 500 messages per request." };
    return body.messages as IncomingMessage[];
  }
  return [body as IncomingMessage];
}

// ---------- Moderation ----------

export async function findTarget(body: Record<string, unknown>): Promise<StoredUser | null> {
  if (typeof body.user_id === "string") return getStoredUserById(body.user_id);
  if (typeof body.username === "string") return getUserByUsername(body.username);
  return null;
}

export async function moderate(
  client: OAuthClient,
  action: "ban" | "unban",
  target: StoredUser,
  reason: string,
): Promise<{ error: string; status: number } | null> {
  // Staff accounts (the owner and admins) can only be moderated on Jace itself.
  if (await isAdmin(target.id)) {
    return { error: "Jace staff accounts can't be banned through the API.", status: 403 };
  }
  if (action === "ban") {
    await banUser(target.id, `${reason || "Banned"} (via ${client.name})`.slice(0, 500));
    // Sign the account out of every app that signed in with Jace.
    await sql`DELETE FROM oauth_tokens WHERE user_id = ${target.id}`;
  } else {
    await unbanUser(target.id);
  }
  await sql`
    INSERT INTO oauth_moderation_log (id, client_id, client_name, action, target_user_id, reason, created_at)
    VALUES (${randomUUID()}, ${client.id}, ${client.name}, ${action}, ${target.id}, ${reason}, ${new Date().toISOString()})
  `;
  return null;
}

export function moderationStatus(user: StoredUser) {
  return {
    user_id: user.id,
    username: user.username,
    banned: !!user.banned,
    ban_reason: user.banReason ?? null,
    banned_at: user.bannedAt ?? null,
    muted: !!user.muted,
  };
}

/**
 * The body app/api/oauth/userinfo returns, also returned by the profile API.
 * `is_admin` (a Jace site admin: the root admin or a granted one) is only
 * shared with official apps, so Jace's own apps can treat Jace staff as staff.
 */
export function userinfoBody(user: StoredUser, scope: string, official: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {
    sub: user.id,
    username: user.username,
    // OIDC "name" is the display name; "username" stays the unique handle.
    name: user.displayName ?? user.username,
    display_name: user.displayName ?? null,
    picture: user.imageUrl ?? null,
    // Lets Jace's apps enforce a Jace ban or mute in their own UI.
    banned: !!user.banned,
    muted: !!user.muted,
  };
  if (official) body.is_admin = isRootAdmin(user.id) || !!user.isAdmin;
  if (scope.split(" ").includes("email") && user.email && user.emailVerified) {
    body.email = user.email;
    body.email_verified = true;
  }
  return body;
}

export type ProfileCaller = { user: StoredUser; client: OAuthClient; scope: string };

/** Checks the request's Bearer token has the "profile" scope and belongs to an official app; returns the user it acts for, or an error response. */
export async function authorizeProfile(request: Request): Promise<ProfileCaller | NextResponse> {
  const header = request.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (!token) return apiError("invalid_request", "Missing bearer token.", 401);
  const session = await getAccessTokenSession(token);
  if (!session) return apiError("invalid_token", "That token is invalid or expired.", 401);
  if (!session.scope.split(" ").includes("profile")) {
    return apiError("insufficient_scope", 'This token needs the "profile" scope.', 403);
  }
  const [user, client] = await Promise.all([
    getStoredUserById(session.userId),
    getOAuthClient(session.clientId),
  ]);
  if (!user || !client) return apiError("invalid_token", "Account or app no longer exists.", 401);
  if (!isOfficialClient(client)) {
    return apiError("insufficient_scope", "Only Jace's own apps can change a profile.", 403);
  }
  if (user.banned) return apiError("account_banned", "This Jace account is banned.", 403);
  if (user.muted) {
    return apiError(
      "account_muted",
      `This Jace account is muted and can't change its profile${user.muteReason ? `: ${user.muteReason}` : "."}`,
      403,
    );
  }
  return { user, client, scope: session.scope };
}

/** Same rule as changing it in Account settings (app/account/actions.ts). */
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
/** Same cap as a profile picture uploaded on Jace (app/profile/[userId]/actions.ts). */
const MAX_PICTURE_BYTES = 4 * 1024 * 1024;
const PICTURE_FETCH_TIMEOUT_MS = 10_000;

/** Identifies PNG, JPEG, GIF (animated too), and WebP by their first bytes, so the stored type never comes from the remote server alone. */
function sniffImageType(bytes: Uint8Array): string | null {
  const starts = (sig: number[], at = 0) => sig.every((b, i) => bytes[at + i] === b);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

/** Rejects hosts that point at this server or a private network (only public https images are fetched). */
function isPublicHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    return false;
  }
  if (host.includes(":")) return false; // IPv6 literal
  const v4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!v4) return true;
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  return !(
    a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
  );
}

/**
 * Downloads an app-supplied picture and checks it the way a normal upload is
 * checked (an image, 4 MB at most), so Jace keeps its own copy instead of
 * depending on the other app's storage.
 */
async function fetchPicture(raw: string): Promise<{ bytes: Uint8Array; type: string } | { error: string }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { error: "picture must be an https URL." };
  }
  if (url.protocol !== "https:" || url.username || url.password || !isPublicHost(url.hostname) || raw.length > 2000) {
    return { error: "picture must be a public https URL." };
  }
  let response: Response;
  try {
    response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(PICTURE_FETCH_TIMEOUT_MS),
      headers: { accept: "image/png,image/jpeg,image/gif,image/webp" },
    });
  } catch {
    return { error: "Couldn't download picture (it must be reachable without redirects)." };
  }
  if (!response.ok || !response.body) {
    return { error: `Couldn't download picture (HTTP ${response.status}).` };
  }
  const declaredType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!declaredType.startsWith("image/")) return { error: "picture must be an image." };
  if (Number(response.headers.get("content-length") ?? 0) > MAX_PICTURE_BYTES) {
    await response.body.cancel().catch(() => {});
    return { error: "picture must be 4MB or smaller." };
  }

  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PICTURE_BYTES) {
        await reader.cancel().catch(() => {});
        return { error: "picture must be 4MB or smaller." };
      }
      chunks.push(value);
    }
  } catch {
    return { error: "Couldn't download picture." };
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const type = sniffImageType(bytes);
  if (!type) return { error: "picture must be a PNG, JPEG, GIF, or WebP image." };
  return { bytes, type };
}

/**
 * Applies a profile change from an official app: `username` follows the same
 * rules as Account settings, `picture` is an https image URL (Jace stores its
 * own copy) or null to remove it. Everything is validated before anything is
 * saved, so a bad picture never leaves a half-applied rename.
 */
export async function updateProfileFromApp(
  caller: ProfileCaller,
  body: Record<string, unknown>,
): Promise<{ user: StoredUser; changed: boolean } | { error: string; description: string; status: number }> {
  const { user } = caller;
  const invalid = (description: string) => ({ error: "invalid_request", description, status: 400 });

  let username: string | undefined;
  if (body.username !== undefined) {
    if (typeof body.username !== "string") return invalid("username must be a string.");
    const candidate = body.username.trim();
    if (!USERNAME_RE.test(candidate)) {
      return invalid("Username must be 3-20 characters: letters, numbers, or underscores.");
    }
    if (candidate !== user.username) {
      if (await isUsernameTaken(candidate, user.id)) {
        return { error: "username_taken", description: "That username is taken.", status: 409 };
      }
      username = candidate;
    }
  }

  let picture: { bytes: Uint8Array; type: string } | null | undefined;
  if (body.picture !== undefined) {
    if (body.picture === null) {
      if (user.imageUrl) picture = null;
    } else if (typeof body.picture !== "string") {
      return invalid("picture must be an https URL or null.");
    } else if (body.picture.trim() !== user.imageUrl) {
      const fetched = await fetchPicture(body.picture.trim());
      if ("error" in fetched) return invalid(fetched.error);
      picture = fetched;
    }
  }

  let imageUrl: string | null | undefined;
  if (picture) {
    const extension = picture.type.slice("image/".length).replace("jpeg", "jpg");
    try {
      imageUrl = await uploadFile(`avatars/${randomUUID()}.${extension}`, Buffer.from(picture.bytes), picture.type);
    } catch {
      return { error: "server_error", description: "Couldn't save the picture. Try again.", status: 500 };
    }
  } else if (picture === null) {
    imageUrl = null;
  }

  if (username) await changeUsername(user.id, username);
  if (imageUrl !== undefined) await setUserImageUrl(user.id, imageUrl);
  if (username === undefined && imageUrl === undefined) return { user, changed: false };
  return {
    user: { ...user, ...(username ? { username } : {}), ...(imageUrl !== undefined ? { imageUrl: imageUrl ?? undefined } : {}) },
    changed: true,
  };
}

export { apiError };
