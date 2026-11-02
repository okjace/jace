import "server-only";
import { NextResponse } from "next/server";
import { sql } from "./db";
import { apiError } from "./integration";
import { getAccessTokenSession, getOAuthClient, isOfficialClient } from "./oauth";
import { getStoredUserById } from "./store";
import type { OAuthClient, StoredUser } from "./types";

/**
 * Storage for Jace Browser sync (okjace/jace-browser). The browser encrypts
 * every collection itself (AES-256-GCM with a key derived from the person's
 * sync passphrase) before it uploads, so this only ever stores opaque
 * ciphertext. Routes: app/api/oauth/sync and app/api/oauth/sync/[collection].
 */

export const SYNC_COLLECTIONS = [
  "keys",
  "bookmarks",
  "history",
  "passwords",
  "cookies",
  "tabs",
  "prefs",
  "addons",
] as const;
export type SyncCollection = (typeof SYNC_COLLECTIONS)[number];

/** Largest encrypted payload per collection (base64 text). */
export const MAX_SYNC_PAYLOAD_BYTES = 8 * 1024 * 1024;

export function isSyncCollection(value: string): value is SyncCollection {
  return (SYNC_COLLECTIONS as readonly string[]).includes(value);
}

export type SyncCaller = { user: StoredUser; client: OAuthClient };

/** Checks the Bearer token has the official-only "sync" scope; returns who it acts for, or an error response. */
export async function authorizeSync(request: Request): Promise<SyncCaller | NextResponse> {
  const header = request.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (!token) return apiError("invalid_request", "Missing bearer token.", 401);
  const session = await getAccessTokenSession(token);
  if (!session) return apiError("invalid_token", "That token is invalid or expired.", 401);
  if (!session.scope.split(" ").includes("sync")) {
    return apiError("insufficient_scope", 'This token needs the "sync" scope.', 403);
  }
  const [user, client] = await Promise.all([
    getStoredUserById(session.userId),
    getOAuthClient(session.clientId),
  ]);
  if (!user || !client) return apiError("invalid_token", "Account or app no longer exists.", 401);
  if (!isOfficialClient(client)) return apiError("insufficient_scope", "Only Jace's own apps can use sync.", 403);
  if (user.banned) return apiError("account_banned", "This Jace account is banned.", 403);
  return { user, client };
}

export type SyncRecord = {
  collection: SyncCollection;
  payload: string;
  version: number;
  updatedBy: string | null;
  updatedAt: string;
};

function rowToRecord(row: Record<string, unknown>): SyncRecord {
  return {
    collection: row.collection as SyncCollection,
    payload: row.payload as string,
    version: Number(row.version),
    updatedBy: (row.updated_by as string) ?? null,
    updatedAt: row.updated_at as string,
  };
}

/** Every collection's version and timestamp (no payloads), so a device can tell what changed. */
export async function listSyncMeta(userId: string): Promise<Omit<SyncRecord, "payload">[]> {
  const rows = await sql`
    SELECT collection, version, updated_by, updated_at, '' AS payload
    FROM browser_sync WHERE user_id = ${userId} ORDER BY collection
  `;
  return rows.map((r) => {
    const { payload: _payload, ...rest } = rowToRecord(r);
    void _payload;
    return rest;
  });
}

export async function getSyncRecord(userId: string, collection: SyncCollection): Promise<SyncRecord | null> {
  const rows = await sql`
    SELECT * FROM browser_sync WHERE user_id = ${userId} AND collection = ${collection}
  `;
  return rows[0] ? rowToRecord(rows[0]) : null;
}

/**
 * Writes a collection if `expectedVersion` matches what's stored (0 = it must
 * not exist yet). Returns the new record, or the current one on a conflict.
 */
export async function putSyncRecord(
  userId: string,
  collection: SyncCollection,
  payload: string,
  expectedVersion: number,
  deviceName: string | null,
): Promise<{ ok: true; record: SyncRecord } | { ok: false; current: SyncRecord | null }> {
  const now = new Date().toISOString();
  const rows =
    expectedVersion === 0
      ? await sql`
          INSERT INTO browser_sync (user_id, collection, payload, version, updated_by, updated_at)
          VALUES (${userId}, ${collection}, ${payload}, 1, ${deviceName}, ${now})
          ON CONFLICT (user_id, collection) DO NOTHING
          RETURNING *
        `
      : await sql`
          UPDATE browser_sync
          SET payload = ${payload}, version = version + 1, updated_by = ${deviceName}, updated_at = ${now}
          WHERE user_id = ${userId} AND collection = ${collection} AND version = ${expectedVersion}
          RETURNING *
        `;
  if (rows[0]) return { ok: true, record: rowToRecord(rows[0]) };
  return { ok: false, current: await getSyncRecord(userId, collection) };
}

export async function deleteSyncRecord(userId: string, collection: SyncCollection): Promise<boolean> {
  const rows = await sql`
    DELETE FROM browser_sync WHERE user_id = ${userId} AND collection = ${collection} RETURNING collection
  `;
  return rows.length > 0;
}

/** Wipes every collection, e.g. when someone forgets their sync passphrase and starts over. */
export async function deleteAllSyncData(userId: string): Promise<number> {
  const rows = await sql`DELETE FROM browser_sync WHERE user_id = ${userId} RETURNING collection`;
  return rows.length;
}
