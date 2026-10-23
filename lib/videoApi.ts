import "server-only";
import { createHash, randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { apiError } from "./integration";
import { getAccessTokenSession, getOAuthClient, isOfficialClient, verifyOAuthClientSecret } from "./oauth";
import { canManageOwned, canViewVideo, getPostBlockReason } from "./permissions";
import { createSignedUploadUrl, getPublicUrl } from "./storage";
import {
  addVideoComment,
  addVideoIfNew,
  getOrgById,
  getStoredUserById,
  getVideoById,
  getVideoLikeCounts,
  getVideoLikeInfo,
} from "./store";
import type { Comment, OAuthClient, StoredUser, VideoRecord, VideoVisibility } from "./types";

/**
 * The videos API Jace's apps (JaceTube first) use now that videos left the
 * Jace site itself (see proxy.ts): the same `videos` table and storage, so
 * every video uploaded on the old Jace site shows up in them. Routes live
 * under app/api/oauth/videos; the developer docs are app/developers.
 *
 * Reading public videos needs either a user token with the "videos" scope or
 * just the app's client credentials (so an app can show videos to people who
 * haven't signed in). Uploading, editing, liking, and commenting need a user
 * token from an official app.
 */

export type VideosCaller = {
  /** Null when the app called with its client credentials only. */
  user: StoredUser | null;
  client: OAuthClient;
  official: boolean;
};

function bearer(request: Request): string | null {
  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer ") ? header.slice(7).trim() || null : null;
}

function basic(request: Request): { id: string; secret: string } | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return null;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const sep = decoded.indexOf(":");
  return sep > 0 ? { id: decoded.slice(0, sep), secret: decoded.slice(sep + 1) } : null;
}

/**
 * A user token with the "videos" scope, or — when `allowApp` — HTTP Basic
 * client credentials. With `write`, it must be a user token from an
 * official app, for an account that's allowed to post.
 */
export async function authorizeVideos(
  request: Request,
  opts: { allowApp?: boolean; write?: string } = {},
): Promise<VideosCaller | NextResponse> {
  const token = bearer(request);
  if (!token) {
    const credentials = opts.allowApp ? basic(request) : null;
    if (!credentials) return apiError("invalid_token", "Missing bearer token.", 401);
    const client = await verifyOAuthClientSecret(credentials.id, credentials.secret);
    if (!client) return apiError("invalid_client", "Unknown client_id/client_secret.", 401);
    return { user: null, client, official: isOfficialClient(client) };
  }

  const session = await getAccessTokenSession(token);
  if (!session) return apiError("invalid_token", "That token is invalid or expired.", 401);
  if (!session.scope.split(" ").includes("videos")) {
    return apiError("insufficient_scope", 'This token needs the "videos" scope.', 403);
  }
  const [user, client] = await Promise.all([
    getStoredUserById(session.userId),
    getOAuthClient(session.clientId),
  ]);
  if (!user || !client) return apiError("invalid_token", "Account or app no longer exists.", 401);
  if (user.banned) return apiError("account_banned", "This Jace account is banned.", 403);
  const official = isOfficialClient(client);
  if (opts.write) {
    if (!official) return apiError("insufficient_scope", `Only Jace's own apps can ${opts.write}.`, 403);
    const block = await getPostBlockReason(user.id, opts.write);
    if (block) return apiError(user.muted ? "account_muted" : "forbidden", block, 403);
  }
  return { user, client, official };
}

// ---------- Responses ----------

type OwnerInfo = { name: string; picture: string | null };

/** Current names and pictures for each video's owner (a user or an org). */
async function ownerInfo(videos: VideoRecord[]): Promise<Map<string, OwnerInfo>> {
  const owners = new Map<string, VideoRecord["ownerType"]>();
  for (const v of videos) owners.set(v.ownerId, v.ownerType);
  const entries = await Promise.all(
    [...owners].map(async ([id, type]): Promise<[string, OwnerInfo | null]> => {
      if (type === "org") {
        const org = await getOrgById(id);
        return [id, org ? { name: org.name, picture: org.imageUrl ?? null } : null];
      }
      const user = await getStoredUserById(id);
      return [id, user ? { name: user.username, picture: user.imageUrl ?? null } : null];
    }),
  );
  return new Map(entries.filter((e): e is [string, OwnerInfo] => !!e[1]));
}

function publicComment(c: Comment) {
  return {
    id: c.id,
    body: c.body,
    author_id: c.authorId,
    author_name: c.authorName,
    pinned: !!c.pinned,
    attachment: c.attachment ?? null,
    created_at: c.createdAt,
  };
}

function publicVideo(v: VideoRecord, owner: OwnerInfo | undefined, likes: number) {
  return {
    id: v.id,
    title: v.title,
    description: v.description,
    url: v.url,
    thumbnail_url: v.thumbnailUrl ?? null,
    content_type: v.contentType,
    size: v.size,
    visibility: v.visibility,
    owner_id: v.ownerId,
    owner_type: v.ownerType,
    owner_name: owner?.name ?? v.ownerName,
    owner_picture: owner?.picture ?? null,
    likes,
    comment_count: v.comments.length,
    created_at: v.createdAt,
  };
}

export async function videoList(videos: VideoRecord[]) {
  const [owners, likes] = await Promise.all([ownerInfo(videos), getVideoLikeCounts(videos.map((v) => v.id))]);
  return videos.map((v) => publicVideo(v, owners.get(v.ownerId), likes.get(v.id) ?? 0));
}

/** One video with its comments, and whether the caller liked it. */
export async function videoDetail(v: VideoRecord, userId: string | null) {
  const [owners, likeInfo] = await Promise.all([ownerInfo([v]), getVideoLikeInfo(v.id, userId ?? undefined)]);
  return {
    ...publicVideo(v, owners.get(v.ownerId), likeInfo.count),
    liked_by_me: likeInfo.likedByMe,
    can_manage: userId ? await canManageOwned(v, userId) : false,
    comments: [...v.comments]
      .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.createdAt.localeCompare(a.createdAt))
      .map(publicComment),
  };
}

/** The video if this caller may see it (private ones: the owner, its org's members, and admins), else null. */
export async function viewableVideo(videoId: string, caller: VideosCaller): Promise<VideoRecord | null> {
  const video = await getVideoById(videoId);
  if (!video) return null;
  return (await canViewVideo(video, caller.user?.id)) ? video : null;
}

// ---------- Uploads ----------

export const VISIBILITIES: VideoVisibility[] = ["public", "unlisted", "private"];
export const MAX_TITLE = 140;
export const MAX_DESCRIPTION = 5000;
const MAX_VIDEO_BYTES = 5 * 1024 * 1024 * 1024;
const MAX_THUMBNAIL_BYTES = 4 * 1024 * 1024;

const KINDS = {
  video: { folder: "videos", type: "video/", max: MAX_VIDEO_BYTES },
  thumbnail: { folder: "thumbnails", type: "image/", max: MAX_THUMBNAIL_BYTES },
} as const;
type UploadKind = keyof typeof KINDS;

function safeFileName(name: string): string {
  const cleaned = name.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return (cleaned || "file").slice(-80);
}

/**
 * A signed URL the app's browser uploads one file to directly (so big videos
 * never pass through Jace or the app's server). Jace picks the path, inside
 * the user's own folder, so a video can only ever be made from a file that
 * user uploaded.
 */
export async function createUpload(
  user: StoredUser,
  body: Record<string, unknown>,
): Promise<
  | { path: string; upload_url: string; method: "PUT"; headers: Record<string, string>; public_url: string }
  | { error: string }
> {
  const kind = (body.kind ?? "video") as UploadKind;
  const rule = KINDS[kind];
  if (!rule) return { error: 'kind must be "video" or "thumbnail".' };
  const contentType = typeof body.content_type === "string" ? body.content_type.toLowerCase() : "";
  if (!contentType.startsWith(rule.type)) return { error: `content_type must be ${rule.type}*.` };
  const size = Number(body.size);
  if (!Number.isFinite(size) || size <= 0) return { error: "size must be the file's size in bytes." };
  if (size > rule.max) return { error: `That file is too big (the limit is ${Math.round(rule.max / 1024 / 1024)}MB).` };

  const filename = safeFileName(typeof body.filename === "string" ? body.filename : kind);
  const path = `${rule.folder}/${user.id}/${randomUUID()}-${filename}`;
  const { signedUrl } = await createSignedUploadUrl(path);
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return {
    path,
    upload_url: signedUrl,
    method: "PUT",
    // Send the file as multipart form data in a field named "" (Supabase's own
    // client does the same), with these headers.
    headers: { apikey: anonKey, authorization: `Bearer ${anonKey}`, "x-upsert": "true" },
    public_url: getPublicUrl(path),
  };
}

function ownsPath(user: StoredUser, kind: UploadKind, path: unknown): path is string {
  return (
    typeof path === "string" &&
    path.startsWith(`${KINDS[kind].folder}/${user.id}/`) &&
    !path.includes("..") &&
    /^[A-Za-z0-9._\/-]+$/.test(path)
  );
}

/** Checks an uploaded file is really there; returns its size and type. */
async function uploadedFile(path: string): Promise<{ url: string; size: number; type: string } | null> {
  const url = getPublicUrl(path);
  try {
    const res = await fetch(url, { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    return {
      url,
      size: Number(res.headers.get("content-length") ?? 0),
      type: (res.headers.get("content-type") ?? "").split(";")[0].trim(),
    };
  } catch {
    return null;
  }
}

/** A stable id for an app-supplied external id (e.g. a YouTube video id), so importing twice never duplicates. */
function importedVideoId(clientId: string, externalId: string): string {
  return `app-${createHash("sha256").update(`${clientId}:${externalId}`).digest("hex").slice(0, 32)}`;
}

function pastTime(value: unknown): string | { error: string } {
  if (value === undefined || value === null || value === "") return new Date().toISOString();
  const time = Date.parse(String(value));
  if (Number.isNaN(time)) return { error: "created_at must be an ISO 8601 date." };
  if (time > Date.now() + 60_000) return { error: "created_at can't be in the future." };
  return new Date(time).toISOString();
}

/**
 * Saves a video from a file uploaded with createUpload. `external_id` makes
 * it idempotent and `created_at` keeps an imported video's original date.
 */
export async function createVideo(
  caller: VideosCaller & { user: StoredUser },
  body: Record<string, unknown>,
): Promise<{ video: VideoRecord; created: boolean } | { error: string; status: number }> {
  const { user, client } = caller;
  const invalid = (error: string) => ({ error, status: 400 });

  const title = typeof body.title === "string" ? body.title.trim().slice(0, MAX_TITLE) : "";
  if (!title) return invalid("title is required.");
  const description = typeof body.description === "string" ? body.description.trim().slice(0, MAX_DESCRIPTION) : "";
  const visibility = (body.visibility ?? "public") as VideoVisibility;
  if (!VISIBILITIES.includes(visibility)) return invalid('visibility must be "public", "unlisted", or "private".');
  const createdAt = pastTime(body.created_at);
  if (typeof createdAt !== "string") return invalid(createdAt.error);
  let externalId: string | null = null;
  if (body.external_id !== undefined && body.external_id !== null) {
    if (typeof body.external_id !== "string" || !body.external_id.trim() || body.external_id.length > 200) {
      return invalid("external_id must be a non-empty string of up to 200 characters.");
    }
    externalId = body.external_id.trim();
  }

  const id = externalId ? importedVideoId(client.id, externalId) : randomUUID();
  if (externalId) {
    const existing = await getVideoById(id);
    if (existing) return { video: existing, created: false };
  }

  if (!ownsPath(user, "video", body.path)) return invalid("path must be one returned by POST /api/oauth/videos/uploads.");
  const file = await uploadedFile(body.path);
  if (!file) return invalid("No uploaded file at that path yet. Upload it first.");
  if (file.type && !file.type.startsWith("video/")) return invalid("That file isn't a video.");

  let thumbnailUrl: string | undefined;
  if (body.thumbnail_path !== undefined && body.thumbnail_path !== null) {
    if (!ownsPath(user, "thumbnail", body.thumbnail_path)) return invalid("thumbnail_path must be one returned by the uploads endpoint.");
    const thumb = await uploadedFile(body.thumbnail_path);
    if (!thumb) return invalid("No uploaded thumbnail at that path yet.");
    thumbnailUrl = thumb.url;
  }

  const record: VideoRecord = {
    id,
    url: file.url,
    pathname: body.path,
    title,
    description,
    thumbnailUrl,
    contentType: file.type || "video/mp4",
    size: file.size,
    ownerId: user.id,
    ownerType: "user",
    ownerName: user.username,
    visibility,
    comments: [],
    createdAt,
  };
  const created = await addVideoIfNew(record);
  return { video: created ? record : ((await getVideoById(id)) ?? record), created };
}

export async function addComment(
  user: StoredUser,
  video: VideoRecord,
  body: Record<string, unknown>,
): Promise<{ comment: ReturnType<typeof publicComment> } | { error: string }> {
  const text = typeof body.body === "string" ? body.body.trim().slice(0, 2000) : "";
  if (!text) return { error: "body is required." };
  const comment: Comment = {
    id: randomUUID(),
    body: text,
    authorId: user.id,
    authorName: user.username,
    createdAt: new Date().toISOString(),
  };
  await addVideoComment(video.id, comment);
  return { comment: publicComment(comment) };
}

export function readJsonObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export { apiError };
