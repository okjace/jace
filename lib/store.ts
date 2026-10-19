import { randomUUID } from "crypto";
import { isRootAdmin, README_FORUM_ID, ROOT_ADMIN_ID, SUPPORT_ORG_ID, THEME_COLORS } from "./constants";
import { sql } from "./db";
import { deleteFiles } from "./storage";
import type {
  AccountDetails,
  AppNotification,
  ChatMessage,
  CloudFileMeta,
  Comment,
  DirectMessage,
  ForumRecord,
  ForumReply,
  ForumTopic,
  GroupChatMessage,
  GroupChatRecord,
  ModerationStatus,
  NotificationPrefs,
  ThemePreference,
  ThemeColor,
  CustomBackground,
  NotificationType,
  OrgRecord,
  PendingCallInvite,
  ProjectIssue,
  ProjectRecord,
  ProjectVersion,
  PublicUser,
  ReportRecord,
  ReportStatus,
  ScoreRecord,
  StoredUser,
  VideoRecord,
} from "./types";

/** Best-effort file cleanup: never let a missing/already-gone file block a delete. */
async function safeDelBlobs(urls: (string | undefined | null)[]): Promise<void> {
  await deleteFiles(urls);
}

/**
 * Historically needed because the JSON-blob store lived behind a CDN with an
 * unpredictable, sometimes 10s+ propagation window between a write and a
 * read seeing it. Postgres reads are consistent the instant a write commits,
 * so this is now a no-op — kept only so call sites don't need to change.
 */
export async function awaitReadYourWrite(check: () => Promise<boolean>): Promise<void> {
  await check();
}

function jsonOrDefault<T>(value: unknown, fallback: T): T {
  return (value as T) ?? fallback;
}

const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  calls: true,
  messages: true,
  videoComments: true,
  forumReplies: true,
};

function toNotificationPrefs(value: unknown): NotificationPrefs {
  return { ...DEFAULT_NOTIFICATION_PREFS, ...(value as Partial<NotificationPrefs> | null) };
}

// ---------- Restricted (banned/muted) accounts ----------
//
// Content written by a banned or muted account (or by an org whose owner is
// one) is hidden on read — chat, DMs, forum posts, comments — never deleted,
// so it all reappears if the account is unbanned/unmuted. SQL queries use the
// `account_restricted` function (lib/schema.sql); JSON-embedded content
// (replies, comments, issues) is filtered in JS with this set.

/** Ids of users, and orgs owned by users, that are currently banned or muted. */
async function restrictedIds(): Promise<Set<string>> {
  const rows = await sql`
    SELECT id FROM users WHERE banned OR muted
    UNION
    SELECT o.id FROM orgs o JOIN users u ON u.id = o.owner_id WHERE u.banned OR u.muted
  `;
  return new Set(rows.map((r) => r.id as string));
}

function visibleComments(list: Comment[], restricted: Set<string>): Comment[] {
  return restricted.size === 0 ? list : list.filter((c) => !restricted.has(c.authorId));
}

/** Shown in a DM thread with, and in the inbox preview for, a muted/banned user. */
export function restrictedDmNotice(banned: boolean): string {
  return `This user has been ${banned ? "banned" : "muted"}, all messages from them will be deleted until they are ${banned ? "unbanned" : "unmuted"}.`;
}

// ---------- Videos ----------
//
// Videos, projects, and orgs owned by a banned or muted account (directly, or
// through an org that account owns) are hidden from every read below via the
// `owner_restricted` SQL function (see lib/schema.sql). Nothing is deleted:
// unbanning/unmuting the owner makes it all reappear.

function rowToVideo(row: Record<string, unknown>): VideoRecord {
  return {
    id: row.id as string,
    url: row.url as string,
    pathname: row.pathname as string,
    title: row.title as string,
    description: row.description as string,
    thumbnailUrl: (row.thumbnail_url as string) ?? undefined,
    contentType: row.content_type as string,
    size: Number(row.size),
    ownerId: row.owner_id as string,
    ownerType: row.owner_type as VideoRecord["ownerType"],
    ownerName: row.owner_name as string,
    visibility: (row.visibility as VideoRecord["visibility"]) ?? "public",
    comments: jsonOrDefault(row.comments, []),
    createdAt: row.created_at as string,
  };
}

function withVisibleVideoComments(v: VideoRecord, restricted: Set<string>): VideoRecord {
  return { ...v, comments: visibleComments(v.comments, restricted) };
}

export async function listVideos(): Promise<VideoRecord[]> {
  const [rows, restricted] = await Promise.all([
    sql`SELECT * FROM videos WHERE NOT owner_restricted(owner_type, owner_id) ORDER BY created_at DESC`,
    restrictedIds(),
  ]);
  return rows.map((r) => withVisibleVideoComments(rowToVideo(r), restricted));
}

/** Videos anyone can discover: excludes unlisted and private videos. */
export async function listPublicVideos(): Promise<VideoRecord[]> {
  const [rows, restricted] = await Promise.all([
    sql`SELECT * FROM videos WHERE visibility = 'public' AND NOT owner_restricted(owner_type, owner_id) ORDER BY created_at DESC`,
    restrictedIds(),
  ]);
  return rows.map((r) => withVisibleVideoComments(rowToVideo(r), restricted));
}

export async function getVideoById(id: string): Promise<VideoRecord | null> {
  const [rows, restricted] = await Promise.all([
    sql`SELECT * FROM videos WHERE id = ${id} AND NOT owner_restricted(owner_type, owner_id)`,
    restrictedIds(),
  ]);
  return rows[0] ? withVisibleVideoComments(rowToVideo(rows[0]), restricted) : null;
}

export async function addVideo(record: VideoRecord): Promise<void> {
  await sql`
    INSERT INTO videos (id, url, pathname, title, description, thumbnail_url, content_type, size, owner_id, owner_type, owner_name, visibility, created_at)
    VALUES (${record.id}, ${record.url}, ${record.pathname}, ${record.title}, ${record.description}, ${record.thumbnailUrl ?? null}, ${record.contentType}, ${record.size}, ${record.ownerId}, ${record.ownerType}, ${record.ownerName}, ${record.visibility}, ${record.createdAt})
  `;
}

export type VideoPatch = Partial<
  Pick<VideoRecord, "title" | "description" | "thumbnailUrl" | "visibility">
>;

export async function updateVideo(id: string, patch: VideoPatch): Promise<void> {
  if (patch.title !== undefined) await sql`UPDATE videos SET title = ${patch.title} WHERE id = ${id}`;
  if (patch.description !== undefined) await sql`UPDATE videos SET description = ${patch.description} WHERE id = ${id}`;
  if (patch.thumbnailUrl !== undefined) await sql`UPDATE videos SET thumbnail_url = ${patch.thumbnailUrl} WHERE id = ${id}`;
  if (patch.visibility !== undefined) await sql`UPDATE videos SET visibility = ${patch.visibility} WHERE id = ${id}`;
}

export async function deleteVideo(id: string): Promise<void> {
  const video = await getVideoById(id);
  if (!video) return;
  await sql.transaction([
    sql`DELETE FROM videos WHERE id = ${id}`,
    sql`DELETE FROM video_likes WHERE video_id = ${id}`,
  ]);
  await safeDelBlobs([
    video.url,
    video.thumbnailUrl,
    ...video.comments.map((c) => c.attachment?.url),
  ]);
}

export async function addVideoComment(videoId: string, comment: Comment): Promise<void> {
  await sql`
    UPDATE videos SET comments = comments || jsonb_build_array(${JSON.stringify(comment)}::jsonb)
    WHERE id = ${videoId}
  `;
}

export async function deleteVideoComment(videoId: string, commentId: string): Promise<void> {
  await sql`
    UPDATE videos SET comments = (
      SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb) FROM jsonb_array_elements(comments) elem WHERE elem->>'id' != ${commentId}
    ) WHERE id = ${videoId}
  `;
}

/** Pinning a comment unpins whatever else was pinned — only one pinned comment at a time. */
export async function pinVideoComment(videoId: string, commentId: string): Promise<void> {
  await sql`
    UPDATE videos SET comments = (
      SELECT jsonb_agg(
        CASE WHEN elem->>'id' = ${commentId} THEN elem || '{"pinned": true}'::jsonb ELSE elem - 'pinned' END
      )
      FROM jsonb_array_elements(comments) elem
    )
    WHERE id = ${videoId}
  `;
}

export async function unpinVideoComment(videoId: string, commentId: string): Promise<void> {
  await sql`
    UPDATE videos SET comments = (
      SELECT jsonb_agg(
        CASE WHEN elem->>'id' = ${commentId} THEN elem - 'pinned' ELSE elem END
      )
      FROM jsonb_array_elements(comments) elem
    )
    WHERE id = ${videoId}
  `;
}

export async function likeVideo(videoId: string, userId: string): Promise<void> {
  await sql`
    INSERT INTO video_likes (video_id, user_id, created_at)
    VALUES (${videoId}, ${userId}, ${new Date().toISOString()})
    ON CONFLICT (video_id, user_id) DO NOTHING
  `;
}

export async function unlikeVideo(videoId: string, userId: string): Promise<void> {
  await sql`DELETE FROM video_likes WHERE video_id = ${videoId} AND user_id = ${userId}`;
}

export async function getVideoLikeInfo(
  videoId: string,
  userId?: string,
): Promise<{ count: number; likedByMe: boolean }> {
  const [countRows, likedRows] = await Promise.all([
    sql`SELECT COUNT(*)::int AS count FROM video_likes WHERE video_id = ${videoId}`,
    userId
      ? sql`SELECT 1 FROM video_likes WHERE video_id = ${videoId} AND user_id = ${userId}`
      : Promise.resolve([]),
  ]);
  return { count: Number(countRows[0]?.count ?? 0), likedByMe: likedRows.length > 0 };
}

/** Bulk like counts for a list of videos, e.g. the videos listing page. */
export async function getVideoLikeCounts(videoIds: string[]): Promise<Map<string, number>> {
  if (videoIds.length === 0) return new Map();
  const rows = await sql`
    SELECT video_id, COUNT(*)::int AS count FROM video_likes
    WHERE video_id = ANY(${videoIds})
    GROUP BY video_id
  `;
  return new Map(rows.map((r) => [r.video_id as string, Number(r.count)]));
}

// ---------- Scores ----------

function rowToScore(row: Record<string, unknown>): ScoreRecord {
  return {
    id: row.id as string,
    game: row.game as ScoreRecord["game"],
    userId: row.user_id as string,
    userName: row.user_name as string,
    score: Number(row.score),
    createdAt: row.created_at as string,
  };
}

export async function listScores(game?: string): Promise<ScoreRecord[]> {
  const rows = game
    ? await sql`SELECT * FROM scores WHERE game = ${game}`
    : await sql`SELECT * FROM scores`;
  const scores = rows.map(rowToScore);
  const avatarUrls = await getAvatarUrlsByIds(scores.map((s) => s.userId));
  return scores.map((s) => ({ ...s, userImageUrl: avatarUrls.get(s.userId) }));
}

export async function addScore(record: ScoreRecord): Promise<void> {
  await sql`
    INSERT INTO scores (id, game, user_id, user_name, score, created_at)
    VALUES (${record.id}, ${record.game}, ${record.userId}, ${record.userName}, ${record.score}, ${record.createdAt})
  `;
}

async function removeScoresByUser(userId: string): Promise<void> {
  await sql`DELETE FROM scores WHERE user_id = ${userId}`;
}

// ---------- Users ----------

function toThemePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

function toThemeColor(value: unknown): ThemeColor {
  return THEME_COLORS.find((c) => c.id === value)?.id ?? "default";
}

function toCustomBackground(value: unknown): CustomBackground {
  const bg = jsonOrDefault<Partial<Record<string, unknown>>>(value, {});
  if (bg.type === "color" && typeof bg.color === "string") return { type: "color", color: bg.color };
  if (bg.type === "image" && typeof bg.imageUrl === "string") {
    return { type: "image", imageUrl: bg.imageUrl, fade: bg.fade !== false };
  }
  return { type: "none" };
}

function rowToStoredUser(row: Record<string, unknown>): StoredUser {
  return {
    id: row.id as string,
    username: row.username as string,
    passwordHash: (row.password_hash as string) ?? undefined,
    bio: row.bio as string,
    imageUrl: (row.image_url as string) ?? undefined,
    bannerUrl: (row.banner_url as string) ?? undefined,
    website: (row.website as string) ?? undefined,
    socialLinks: jsonOrDefault(row.social_links, []),
    defaultVideoTitle: (row.default_video_title as string) ?? undefined,
    defaultVideoDescription: (row.default_video_description as string) ?? undefined,
    email: (row.email as string) ?? undefined,
    emailVerified: !!row.email_verified,
    pendingEmail: (row.pending_email as string) ?? undefined,
    emailVerificationTokenHash: (row.email_verification_token_hash as string) ?? undefined,
    emailVerificationExpiresAt: (row.email_verification_expires_at as string) ?? undefined,
    passwordResetTokenHash: (row.password_reset_token_hash as string) ?? undefined,
    passwordResetExpiresAt: (row.password_reset_expires_at as string) ?? undefined,
    signInTokenHash: (row.sign_in_token_hash as string) ?? undefined,
    signInExpiresAt: (row.sign_in_expires_at as string) ?? undefined,
    deletionTokenHash: (row.deletion_token_hash as string) ?? undefined,
    deletionExpiresAt: (row.deletion_expires_at as string) ?? undefined,
    totpEnabled: !!row.totp_enabled,
    totpSecret: (row.totp_secret as string) ?? undefined,
    totpPendingSecret: (row.totp_pending_secret as string) ?? undefined,
    githubId: (row.github_id as string) ?? undefined,
    isAdmin: !!row.is_admin,
    notificationPrefs: toNotificationPrefs(row.notification_prefs),
    banned: !!row.banned,
    banReason: (row.ban_reason as string) ?? undefined,
    bannedAt: (row.banned_at as string) ?? undefined,
    muted: !!row.muted,
    muteReason: (row.mute_reason as string) ?? undefined,
    mutedAt: (row.muted_at as string) ?? undefined,
    readmeSeenAt: (row.readme_seen_at as string) ?? undefined,
    theme: toThemePreference(row.theme),
    themeColor: toThemeColor(row.theme_color),
    background: toCustomBackground(row.background),
    customCss: (row.custom_css as string) ?? undefined,
    createdAt: row.created_at as string,
  };
}

function toPublicUser(user: StoredUser): PublicUser {
  const {
    passwordHash: _passwordHash,
    customCss: _customCss,
    themeColor: _themeColor,
    background: _background,
    email: _email,
    emailVerified: _emailVerified,
    pendingEmail: _pendingEmail,
    emailVerificationTokenHash: _evth,
    emailVerificationExpiresAt: _evea,
    passwordResetTokenHash: _prth,
    passwordResetExpiresAt: _prea,
    signInTokenHash: _sith,
    signInExpiresAt: _siea,
    deletionTokenHash: _dth,
    deletionExpiresAt: _dea,
    totpEnabled: _totpEnabled,
    totpSecret: _totpSecret,
    totpPendingSecret: _totpPendingSecret,
    githubId: _githubId,
    banned: _banned,
    banReason: _banReason,
    bannedAt: _bannedAt,
    muted: _muted,
    muteReason: _muteReason,
    mutedAt: _mutedAt,
    ...rest
  } = user;
  return { ...rest, socialLinks: rest.socialLinks ?? [] };
}

export async function listUsers(): Promise<PublicUser[]> {
  const rows = await sql`SELECT * FROM users ORDER BY created_at ASC`;
  return rows.map(rowToStoredUser).map(toPublicUser);
}

export async function getUserById(id: string): Promise<PublicUser | null> {
  const rows = await sql`SELECT * FROM users WHERE id = ${id}`;
  return rows[0] ? toPublicUser(rowToStoredUser(rows[0])) : null;
}

/** The root admin (see `lib/constants.ts`) is always an admin; anyone else needs the granted `is_admin` flag. */
export async function isAdmin(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  if (isRootAdmin(userId)) return true;
  const rows = await sql`SELECT is_admin FROM users WHERE id = ${userId}`;
  return rows[0]?.is_admin === true;
}

/** Only the root admin may call this (enforced by callers, e.g. the account-settings action). */
export async function setUserAdmin(userId: string, admin: boolean): Promise<void> {
  await sql`UPDATE users SET is_admin = ${admin} WHERE id = ${userId}`;
}

/** Admins granted via Account settings — excludes the root admin, who doesn't need the flag. */
export async function listGrantedAdmins(): Promise<PublicUser[]> {
  const rows = await sql`SELECT * FROM users WHERE is_admin = TRUE ORDER BY lower(username) ASC`;
  return rows.map(rowToStoredUser).map(toPublicUser);
}

/** Admin-only: never expose ban/mute reasons via `PublicUser`. */
export async function getModerationStatus(userId: string): Promise<ModerationStatus | null> {
  const user = await getStoredUserById(userId);
  if (!user) return null;
  return {
    banned: !!user.banned,
    banReason: user.banReason,
    bannedAt: user.bannedAt,
    muted: !!user.muted,
    muteReason: user.muteReason,
    mutedAt: user.mutedAt,
  };
}

export async function banUser(userId: string, reason: string): Promise<void> {
  await sql`
    UPDATE users SET banned = TRUE, ban_reason = ${reason}, banned_at = ${new Date().toISOString()}
    WHERE id = ${userId}
  `;
}

export async function unbanUser(userId: string): Promise<void> {
  await sql`UPDATE users SET banned = FALSE, ban_reason = NULL, banned_at = NULL WHERE id = ${userId}`;
}

export async function muteUser(userId: string, reason: string): Promise<void> {
  await sql`
    UPDATE users SET muted = TRUE, mute_reason = ${reason}, muted_at = ${new Date().toISOString()}
    WHERE id = ${userId}
  `;
}

export async function unmuteUser(userId: string): Promise<void> {
  await sql`UPDATE users SET muted = FALSE, mute_reason = NULL, muted_at = NULL WHERE id = ${userId}`;
}

/**
 * Batch lookup for rendering a list of posts/messages/scores by distinct
 * author id without an N+1 query per row. Returns a map of id -> avatar
 * image URL (missing/imageless users are simply absent from the map).
 */
export async function getAvatarUrlsByIds(
  ids: string[],
): Promise<Map<string, string | undefined>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await sql`SELECT id, image_url FROM users WHERE id = ANY(${unique})`;
  return new Map(rows.map((r) => [r.id as string, (r.image_url as string) ?? undefined]));
}

/**
 * Same as `getAvatarUrlsByIds`, but for owners that can be either a user or
 * an org (videos/projects can be posted as either) — looks each id up in
 * the right table based on its `type`.
 */
export async function getOwnerAvatarUrls(
  owners: { id: string; type: "user" | "org" }[],
): Promise<Map<string, string | undefined>> {
  const userIds = [...new Set(owners.filter((o) => o.type === "user").map((o) => o.id))];
  const orgIds = [...new Set(owners.filter((o) => o.type === "org").map((o) => o.id))];
  const [userRows, orgRows] = await Promise.all([
    userIds.length
      ? sql`SELECT id, image_url FROM users WHERE id = ANY(${userIds})`
      : Promise.resolve([]),
    orgIds.length
      ? sql`SELECT id, image_url FROM orgs WHERE id = ANY(${orgIds})`
      : Promise.resolve([]),
  ]);
  const result = new Map<string, string | undefined>();
  for (const row of [...userRows, ...orgRows]) {
    result.set(row.id as string, (row.image_url as string) ?? undefined);
  }
  return result;
}

/** Internal/server-only: includes credentials and tokens. Never expose this directly. */
export async function getStoredUserById(id: string): Promise<StoredUser | null> {
  const rows = await sql`SELECT * FROM users WHERE id = ${id}`;
  return rows[0] ? rowToStoredUser(rows[0]) : null;
}

export async function getUserByUsername(username: string): Promise<StoredUser | null> {
  const rows = await sql`SELECT * FROM users WHERE lower(username) = lower(${username})`;
  return rows[0] ? rowToStoredUser(rows[0]) : null;
}

export async function getUserByEmail(email: string): Promise<StoredUser | null> {
  const rows = await sql`SELECT * FROM users WHERE lower(email) = lower(${email})`;
  return rows[0] ? rowToStoredUser(rows[0]) : null;
}

export async function addUser(user: StoredUser): Promise<void> {
  await sql`
    INSERT INTO users (id, username, password_hash, bio, created_at)
    VALUES (${user.id}, ${user.username}, ${user.passwordHash ?? null}, ${user.bio}, ${user.createdAt})
  `;
}

export type UserProfilePatch = Partial<
  Pick<
    StoredUser,
    | "bio"
    | "imageUrl"
    | "bannerUrl"
    | "website"
    | "socialLinks"
    | "defaultVideoTitle"
    | "defaultVideoDescription"
  >
>;

export async function updateUserProfile(id: string, patch: UserProfilePatch): Promise<void> {
  if (patch.bio !== undefined) await sql`UPDATE users SET bio = ${patch.bio} WHERE id = ${id}`;
  if (patch.imageUrl !== undefined) await sql`UPDATE users SET image_url = ${patch.imageUrl} WHERE id = ${id}`;
  if (patch.bannerUrl !== undefined) await sql`UPDATE users SET banner_url = ${patch.bannerUrl} WHERE id = ${id}`;
  if (patch.website !== undefined) await sql`UPDATE users SET website = ${patch.website} WHERE id = ${id}`;
  if (patch.socialLinks !== undefined) await sql`UPDATE users SET social_links = ${JSON.stringify(patch.socialLinks)}::jsonb WHERE id = ${id}`;
  if (patch.defaultVideoTitle !== undefined) await sql`UPDATE users SET default_video_title = ${patch.defaultVideoTitle} WHERE id = ${id}`;
  if (patch.defaultVideoDescription !== undefined) await sql`UPDATE users SET default_video_description = ${patch.defaultVideoDescription} WHERE id = ${id}`;
}

// ---------- Account settings ----------

export async function getAccountDetails(id: string): Promise<AccountDetails | null> {
  const rows = await sql`SELECT * FROM users WHERE id = ${id}`;
  if (!rows[0]) return null;
  const user = rowToStoredUser(rows[0]);
  return {
    id: user.id,
    username: user.username,
    hasPassword: !!user.passwordHash,
    email: user.email,
    emailVerified: !!user.emailVerified,
    pendingEmail: user.pendingEmail,
    totpEnabled: !!user.totpEnabled,
    notificationPrefs: user.notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS,
    theme: user.theme ?? "system",
    themeColor: user.themeColor ?? "default",
    background: user.background ?? { type: "none" },
    customCss: user.customCss ?? "",
  };
}

export async function updateAppearance(
  userId: string,
  appearance: {
    theme: ThemePreference;
    themeColor: ThemeColor;
    background: CustomBackground;
    customCss: string;
  },
): Promise<void> {
  const { theme, themeColor, background, customCss } = appearance;
  const rows = await sql`SELECT background FROM users WHERE id = ${userId}`;
  const previous = toCustomBackground(rows[0]?.background);
  await sql`
    UPDATE users SET theme = ${theme}, theme_color = ${themeColor},
      background = ${JSON.stringify(background)}::jsonb, custom_css = ${customCss || null}
    WHERE id = ${userId}
  `;
  // Drop a replaced upload (deleteFiles ignores URLs that aren't in our storage).
  if (previous.type === "image" && (background.type !== "image" || background.imageUrl !== previous.imageUrl)) {
    await deleteFiles([previous.imageUrl]);
  }
}

export async function updateNotificationPrefs(
  userId: string,
  prefs: NotificationPrefs,
): Promise<void> {
  await sql`UPDATE users SET notification_prefs = ${JSON.stringify(prefs)}::jsonb WHERE id = ${userId}`;
}

export async function isUsernameTaken(username: string, excludeUserId?: string): Promise<boolean> {
  const rows = await sql`
    SELECT id FROM users WHERE lower(username) = lower(${username}) AND id != ${excludeUserId ?? ""}
  `;
  return rows.length > 0;
}

/**
 * Every chat message, DM, forum post, comment, etc. stores the author's
 * username (or an org's name, for org-authored ones) as a plain snapshot column (not a live join) — see e.g.
 * `ChatMessage.userName` — so a rename has to be pushed out to all of them
 * here, in one go, or old posts would keep showing the pre-rename name
 * forever.
 */
async function cascadeNameChange(
  userId: string,
  newUsername: string,
  ownerType: "user" | "org",
): Promise<void> {
  await sql.transaction([
    sql`UPDATE chat_messages SET user_name = ${newUsername} WHERE user_id = ${userId}`,
    sql`UPDATE scores SET user_name = ${newUsername} WHERE user_id = ${userId}`,
    sql`UPDATE dm_messages SET from_name = ${newUsername} WHERE from_id = ${userId}`,
    sql`UPDATE dm_messages SET to_name = ${newUsername} WHERE to_id = ${userId}`,
    sql`UPDATE group_chat_messages SET from_name = ${newUsername} WHERE from_id = ${userId}`,
    sql`UPDATE forum_topics SET author_name = ${newUsername} WHERE author_id = ${userId}`,
    sql`UPDATE videos SET owner_name = ${newUsername} WHERE owner_type = ${ownerType} AND owner_id = ${userId}`,
    sql`UPDATE projects SET owner_name = ${newUsername} WHERE owner_type = ${ownerType} AND owner_id = ${userId}`,
    sql`
      UPDATE forum_topics SET replies = (
        SELECT COALESCE(jsonb_agg(
          CASE WHEN elem->>'authorId' = ${userId} THEN elem || jsonb_build_object('authorName', ${newUsername}::text) ELSE elem END
        ), '[]'::jsonb)
        FROM jsonb_array_elements(replies) elem
      )
      WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(replies) e WHERE e->>'authorId' = ${userId})
    `,
    sql`
      UPDATE videos SET comments = (
        SELECT COALESCE(jsonb_agg(
          CASE WHEN elem->>'authorId' = ${userId} THEN elem || jsonb_build_object('authorName', ${newUsername}::text) ELSE elem END
        ), '[]'::jsonb)
        FROM jsonb_array_elements(comments) elem
      )
      WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(comments) e WHERE e->>'authorId' = ${userId})
    `,
    sql`
      UPDATE projects SET comments = (
        SELECT COALESCE(jsonb_agg(
          CASE WHEN elem->>'authorId' = ${userId} THEN elem || jsonb_build_object('authorName', ${newUsername}::text) ELSE elem END
        ), '[]'::jsonb)
        FROM jsonb_array_elements(comments) elem
      )
      WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(comments) e WHERE e->>'authorId' = ${userId})
    `,
    sql`
      UPDATE projects SET issues = (
        SELECT COALESCE(jsonb_agg(
          (CASE WHEN elem->>'authorId' = ${userId} THEN elem || jsonb_build_object('authorName', ${newUsername}::text) ELSE elem END)
          || jsonb_build_object('comments', (
            SELECT COALESCE(jsonb_agg(
              CASE WHEN c->>'authorId' = ${userId} THEN c || jsonb_build_object('authorName', ${newUsername}::text) ELSE c END
            ), '[]'::jsonb)
            FROM jsonb_array_elements(COALESCE(elem->'comments', '[]'::jsonb)) c
          ))
        ), '[]'::jsonb)
        FROM jsonb_array_elements(issues) elem
      )
      WHERE EXISTS (
        SELECT 1 FROM jsonb_array_elements(issues) e
        WHERE e->>'authorId' = ${userId}
           OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(e->'comments', '[]'::jsonb)) c WHERE c->>'authorId' = ${userId})
      )
    `,
  ]);
}

export async function changeUsername(id: string, username: string): Promise<void> {
  await sql`UPDATE users SET username = ${username} WHERE id = ${id}`;
  await cascadeNameChange(id, username, "user");
}

export async function setPasswordHash(id: string, passwordHash: string): Promise<void> {
  await sql`UPDATE users SET password_hash = ${passwordHash} WHERE id = ${id}`;
}

export async function requestEmailChange(
  id: string,
  pendingEmail: string,
  tokenHash: string,
  expiresAt: string,
): Promise<void> {
  await sql`
    UPDATE users
    SET pending_email = ${pendingEmail}, email_verification_token_hash = ${tokenHash}, email_verification_expires_at = ${expiresAt}
    WHERE id = ${id}
  `;
}

/** Returns the confirmed email on success, or null if the token was invalid/expired. */
export async function confirmEmailChange(tokenHash: string): Promise<string | null> {
  const rows = await sql`
    UPDATE users
    SET email = pending_email, email_verified = TRUE, pending_email = NULL,
        email_verification_token_hash = NULL, email_verification_expires_at = NULL
    WHERE email_verification_token_hash = ${tokenHash}
      AND pending_email IS NOT NULL
      AND email_verification_expires_at > ${new Date().toISOString()}
    RETURNING email
  `;
  return rows[0] ? (rows[0].email as string) : null;
}

export async function requestPasswordReset(
  userId: string,
  tokenHash: string,
  expiresAt: string,
): Promise<void> {
  await sql`
    UPDATE users SET password_reset_token_hash = ${tokenHash}, password_reset_expires_at = ${expiresAt}
    WHERE id = ${userId}
  `;
}

/** Sets the new password if the token is valid/unexpired. Returns whether it succeeded. */
export async function consumePasswordReset(
  tokenHash: string,
  newPasswordHash: string,
): Promise<boolean> {
  const rows = await sql`
    UPDATE users
    SET password_hash = ${newPasswordHash}, password_reset_token_hash = NULL, password_reset_expires_at = NULL
    WHERE password_reset_token_hash = ${tokenHash}
      AND password_reset_expires_at > ${new Date().toISOString()}
    RETURNING id
  `;
  return rows.length > 0;
}

export async function requestEmailSignIn(
  userId: string,
  tokenHash: string,
  expiresAt: string,
): Promise<void> {
  await sql`
    UPDATE users SET sign_in_token_hash = ${tokenHash}, sign_in_expires_at = ${expiresAt}
    WHERE id = ${userId}
  `;
}

/**
 * Returns the matching userId if the token is valid/unexpired, without
 * consuming it — like `checkAccountDeletionToken`, this lets a page render
 * (and decide whether to ask for a 2FA code) before the sign-in actually
 * happens, so a link-prefetcher visiting the page can't burn a real user's
 * only chance to use the link.
 */
export async function checkEmailSignInToken(tokenHash: string): Promise<string | null> {
  const rows = await sql`
    SELECT id FROM users
    WHERE sign_in_token_hash = ${tokenHash} AND sign_in_expires_at > ${new Date().toISOString()}
  `;
  return rows[0] ? (rows[0].id as string) : null;
}

export async function consumeEmailSignInToken(userId: string): Promise<void> {
  await sql`UPDATE users SET sign_in_token_hash = NULL, sign_in_expires_at = NULL WHERE id = ${userId}`;
}

export async function requestAccountDeletion(
  userId: string,
  tokenHash: string,
  expiresAt: string,
): Promise<void> {
  await sql`
    UPDATE users SET deletion_token_hash = ${tokenHash}, deletion_expires_at = ${expiresAt}
    WHERE id = ${userId}
  `;
}

/** Returns the matching userId if the token is valid/unexpired, without deleting anything. */
export async function checkAccountDeletionToken(tokenHash: string): Promise<string | null> {
  const rows = await sql`
    SELECT id FROM users
    WHERE deletion_token_hash = ${tokenHash} AND deletion_expires_at >= ${new Date().toISOString()}
  `;
  return rows[0] ? (rows[0].id as string) : null;
}

export async function startTotpEnrollment(userId: string, secret: string): Promise<void> {
  await sql`UPDATE users SET totp_pending_secret = ${secret} WHERE id = ${userId}`;
}

/** Moves a confirmed pending TOTP secret to active. Caller must verify the code first. */
export async function confirmTotpEnrollment(userId: string): Promise<boolean> {
  const rows = await sql`
    UPDATE users
    SET totp_secret = totp_pending_secret, totp_pending_secret = NULL, totp_enabled = TRUE
    WHERE id = ${userId} AND totp_pending_secret IS NOT NULL
    RETURNING id
  `;
  return rows.length > 0;
}

export async function disableTotp(userId: string): Promise<void> {
  await sql`
    UPDATE users SET totp_enabled = FALSE, totp_secret = NULL, totp_pending_secret = NULL
    WHERE id = ${userId}
  `;
}

/**
 * Resolves a GitHub sign-in to a stable app-level user id, called from the
 * `jwt` callback in auth.ts on every GitHub sign-in.
 *
 * This exists because Auth.js, run without a database adapter, mints a fresh
 * `crypto.randomUUID()` for `user.id` on *every single OAuth sign-in* — by
 * design, since it has nowhere of its own to persist a stable one (see
 * `getUserAndAccount` in `@auth/core`). The provider's actual stable id lives
 * on `account.providerAccountId` instead.
 *
 * Resolution order: (1) a record already linked to this `githubId`, (2) an
 * existing record whose *verified* email matches the GitHub account's email
 * — linked automatically since both sides are independently verified, (3)
 * otherwise a new record, disambiguating the username if it collides.
 */
export async function resolveGithubUserId(
  githubId: string,
  email: string | undefined,
  desiredUsername: string,
): Promise<string> {
  const byGithub = await sql`SELECT id FROM users WHERE github_id = ${githubId}`;
  if (byGithub[0]) return byGithub[0].id as string;

  if (email) {
    const byEmail = await sql`
      UPDATE users SET github_id = ${githubId}
      WHERE lower(email) = lower(${email}) AND email_verified = TRUE
      RETURNING id
    `;
    if (byEmail[0]) return byEmail[0].id as string;
  }

  const existingUsernames = await sql`SELECT username FROM users`;
  const taken = new Set(existingUsernames.map((r) => (r.username as string).toLowerCase()));
  let username = desiredUsername.replace(/\s+/g, "").slice(0, 20) || "user";
  for (let suffix = 2; taken.has(username.toLowerCase()); suffix++) {
    username = `${desiredUsername}${suffix}`.replace(/\s+/g, "").slice(0, 20);
  }
  const newId = randomUUID();
  await sql`
    INSERT INTO users (id, username, bio, created_at, github_id)
    VALUES (${newId}, ${username}, '', ${new Date().toISOString()}, ${githubId})
  `;
  return newId;
}

/**
 * Deletes an account: removes the user row and their user-owned videos and
 * projects, game scores, and drops them from any org's member list — all in
 * one transaction, so this can never leave the account half-deleted. Orgs
 * they own are left in place (ownership isn't transferred automatically).
 * Blob cleanup (avatar/banner/video/project files) happens best-effort
 * afterward, since orphaned files are harmless but a half-deleted account
 * isn't.
 */
export const DATA_CATEGORIES = [
  "videos",
  "projects",
  "forum",
  "comments",
  "chat",
  "messages",
  "cloud",
  "scores",
  "activity",
  "profile",
] as const;
export type DataCategory = (typeof DATA_CATEGORIES)[number];

/**
 * Deletes one category of a user's own data without touching the account
 * itself (see "Your data" in profile settings). Returns how many items went.
 * Only ever touches things authored/owned by `userId` — org-authored content
 * and other people's replies/messages are left alone.
 */
export async function deleteUserData(userId: string, category: DataCategory): Promise<number> {
  const like = `%${userId}%`;
  switch (category) {
    case "videos": {
      const rows = await sql`SELECT id FROM videos WHERE owner_type = 'user' AND owner_id = ${userId}`;
      for (const r of rows) await deleteVideo(r.id as string);
      return rows.length;
    }
    case "projects": {
      const rows = await sql`SELECT id FROM projects WHERE owner_type = 'user' AND owner_id = ${userId}`;
      for (const r of rows) await deleteProject(r.id as string);
      return rows.length;
    }
    case "forum": {
      let count = 0;
      const own = await sql`SELECT id FROM forum_topics WHERE author_type = 'user' AND author_id = ${userId}`;
      for (const r of own) await deleteTopic(r.id as string);
      count += own.length;
      const withReplies = await sql`SELECT id, replies FROM forum_topics WHERE replies::text LIKE ${like}`;
      for (const r of withReplies) {
        const replies = (r.replies as ForumTopic["replies"]) ?? [];
        const kept = replies.filter((x) => !(x.authorId === userId && (x.authorType ?? "user") === "user"));
        if (kept.length === replies.length) continue;
        await sql`UPDATE forum_topics SET replies = ${JSON.stringify(kept)}::jsonb WHERE id = ${r.id as string}`;
        await safeDelBlobs(replies.filter((x) => !kept.includes(x)).map((x) => x.attachment?.url));
        count += replies.length - kept.length;
      }
      return count;
    }
    case "comments": {
      let count = 0;
      const videos = await sql`SELECT id, comments FROM videos WHERE comments::text LIKE ${like}`;
      for (const v of videos) {
        const all = (v.comments as Comment[]) ?? [];
        const kept = all.filter((c) => c.authorId !== userId);
        if (kept.length === all.length) continue;
        await sql`UPDATE videos SET comments = ${JSON.stringify(kept)}::jsonb WHERE id = ${v.id as string}`;
        await safeDelBlobs(all.filter((c) => !kept.includes(c)).map((c) => c.attachment?.url));
        count += all.length - kept.length;
      }
      const projects = await sql`SELECT id, comments, issues FROM projects WHERE comments::text LIKE ${like} OR issues::text LIKE ${like}`;
      for (const p of projects) {
        const comments = (p.comments as Comment[]) ?? [];
        const issues = (p.issues as ProjectIssue[]) ?? [];
        const keptComments = comments.filter((c) => c.authorId !== userId);
        const ownIssues = issues.filter((i) => i.authorId === userId);
        const keptIssues = issues
          .filter((i) => i.authorId !== userId)
          .map((i) => ({ ...i, comments: i.comments.filter((c) => c.authorId !== userId) }));
        const removedIssueComments = issues
          .filter((i) => i.authorId !== userId)
          .reduce((n, i) => n + i.comments.length, 0) -
          keptIssues.reduce((n, i) => n + i.comments.length, 0);
        const removed =
          comments.length - keptComments.length + ownIssues.length + removedIssueComments;
        if (removed === 0) continue;
        await sql`UPDATE projects SET comments = ${JSON.stringify(keptComments)}::jsonb, issues = ${JSON.stringify(keptIssues)}::jsonb WHERE id = ${p.id as string}`;
        await safeDelBlobs([
          ...comments.filter((c) => c.authorId === userId).map((c) => c.attachment?.url),
          ...ownIssues.flatMap((i) => i.comments.map((c) => c.attachment?.url)),
        ]);
        count += removed;
      }
      return count;
    }
    case "chat": {
      const rows = await sql`DELETE FROM chat_messages WHERE user_id = ${userId} AND user_type = 'user' RETURNING attachment`;
      await safeDelBlobs(rows.map((r) => (r.attachment as { url?: string } | null)?.url));
      return rows.length;
    }
    case "messages": {
      const dms = await sql`DELETE FROM dm_messages WHERE from_id = ${userId} RETURNING attachment`;
      await safeDelBlobs(dms.map((r) => (r.attachment as { url?: string } | null)?.url));
      const groups = await sql`DELETE FROM group_chat_messages WHERE from_id = ${userId} RETURNING id`;
      return dms.length + groups.length;
    }
    case "cloud": {
      const rows = await sql`DELETE FROM cloud_files WHERE owner_id = ${userId} RETURNING id`;
      return rows.length;
    }
    case "scores": {
      const rows = await sql`DELETE FROM scores WHERE user_id = ${userId} RETURNING id`;
      return rows.length;
    }
    case "activity": {
      const likes = await sql`DELETE FROM video_likes WHERE user_id = ${userId} RETURNING user_id`;
      const follows = await sql`DELETE FROM follows WHERE follower_id = ${userId} OR following_id = ${userId} RETURNING follower_id`;
      const notes = await sql`DELETE FROM notifications WHERE user_id = ${userId} RETURNING id`;
      return likes.length + follows.length + notes.length;
    }
    case "profile": {
      const rows = await sql`SELECT image_url, banner_url, background FROM users WHERE id = ${userId}`;
      const background = toCustomBackground(rows[0]?.background);
      await sql`
        UPDATE users SET bio = '', website = NULL, social_links = '[]'::jsonb,
          default_video_title = NULL, default_video_description = NULL,
          image_url = NULL, banner_url = NULL, custom_css = NULL,
          background = '{"type":"none"}'::jsonb
        WHERE id = ${userId}
      `;
      await safeDelBlobs([
        rows[0]?.image_url as string | undefined,
        rows[0]?.banner_url as string | undefined,
        background.type === "image" ? background.imageUrl : undefined,
      ]);
      return 1;
    }
  }
}

export async function deleteUserAccount(id: string): Promise<void> {
  const [userRows, ownVideos, ownProjects, orgRows] = await Promise.all([
    sql`SELECT * FROM users WHERE id = ${id}`,
    sql`SELECT * FROM videos WHERE owner_type = 'user' AND owner_id = ${id}`,
    sql`SELECT * FROM projects WHERE owner_type = 'user' AND owner_id = ${id}`,
    sql`SELECT id, member_ids FROM orgs WHERE member_ids @> ${JSON.stringify([id])}::jsonb`,
  ]);
  const user = userRows[0] ? rowToStoredUser(userRows[0]) : null;
  const videos = ownVideos.map(rowToVideo);
  const projects = ownProjects.map(rowToProject);

  await sql.transaction([
    sql`DELETE FROM videos WHERE owner_type = 'user' AND owner_id = ${id}`,
    sql`DELETE FROM projects WHERE owner_type = 'user' AND owner_id = ${id}`,
    sql`DELETE FROM scores WHERE user_id = ${id}`,
    sql`DELETE FROM video_likes WHERE user_id = ${id}`,
    sql`DELETE FROM follows WHERE follower_id = ${id} OR following_id = ${id}`,
    ...orgRows.map(
      (o) =>
        sql`
          UPDATE orgs SET member_ids = (
            SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb) FROM jsonb_array_elements(member_ids) elem WHERE elem != ${JSON.stringify(id)}::jsonb
          ) WHERE id = ${o.id}
        `,
    ),
    sql`DELETE FROM users WHERE id = ${id}`,
  ]);

  const blobUrls = [
    user?.imageUrl,
    user?.bannerUrl,
    user?.background?.type === "image" ? user.background.imageUrl : undefined,
    ...videos.flatMap((v) => [v.url, v.thumbnailUrl]),
    ...projects.flatMap((p) => [
      p.iconUrl,
      p.bannerUrl,
      ...p.versions.flatMap((v) => [
        ...v.files.map((f) => f.url),
        ...v.sourceFiles.map((f) => f.url),
      ]),
    ]),
  ];
  await safeDelBlobs(blobUrls);
}

// ---------- Follows ----------

export async function followUser(followerId: string, followingId: string): Promise<void> {
  if (followerId === followingId) return;
  await sql`
    INSERT INTO follows (follower_id, following_id, created_at)
    VALUES (${followerId}, ${followingId}, ${new Date().toISOString()})
    ON CONFLICT (follower_id, following_id) DO NOTHING
  `;
}

export async function unfollowUser(followerId: string, followingId: string): Promise<void> {
  await sql`DELETE FROM follows WHERE follower_id = ${followerId} AND following_id = ${followingId}`;
}

export async function isFollowing(followerId: string, followingId: string): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM follows WHERE follower_id = ${followerId} AND following_id = ${followingId}
  `;
  return rows.length > 0;
}

export async function getFollowCounts(
  userId: string,
): Promise<{ followers: number; following: number }> {
  const [followerRows, followingRows] = await Promise.all([
    sql`SELECT COUNT(*)::int AS count FROM follows WHERE following_id = ${userId}`,
    sql`SELECT COUNT(*)::int AS count FROM follows WHERE follower_id = ${userId}`,
  ]);
  return {
    followers: Number(followerRows[0]?.count ?? 0),
    following: Number(followingRows[0]?.count ?? 0),
  };
}

export async function listFollowers(userId: string): Promise<PublicUser[]> {
  const rows = await sql`
    SELECT u.* FROM users u
    JOIN follows f ON f.follower_id = u.id
    WHERE f.following_id = ${userId}
    ORDER BY f.created_at DESC
  `;
  return rows.map(rowToStoredUser).map(toPublicUser);
}

export async function listFollowing(userId: string): Promise<PublicUser[]> {
  const rows = await sql`
    SELECT u.* FROM users u
    JOIN follows f ON f.following_id = u.id
    WHERE f.follower_id = ${userId}
    ORDER BY f.created_at DESC
  `;
  return rows.map(rowToStoredUser).map(toPublicUser);
}

// ---------- Projects ----------

function rowToProject(row: Record<string, unknown>): ProjectRecord {
  return {
    id: row.id as string,
    ownerId: row.owner_id as string,
    ownerType: row.owner_type as ProjectRecord["ownerType"],
    ownerName: row.owner_name as string,
    name: row.name as string,
    description: row.description as string,
    readme: (row.readme as string) ?? "",
    iconUrl: row.icon_url as string,
    bannerUrl: (row.banner_url as string) ?? undefined,
    websiteUrl: (row.website_url as string) ?? undefined,
    sourceUrl: (row.source_url as string) ?? undefined,
    sortOrder: Number(row.sort_order ?? 0),
    versions: jsonOrDefault(row.versions, []),
    comments: jsonOrDefault(row.comments, []),
    issues: jsonOrDefault(row.issues, []),
    createdAt: row.created_at as string,
  };
}

function withVisibleProjectContent(p: ProjectRecord, restricted: Set<string>): ProjectRecord {
  return {
    ...p,
    comments: visibleComments(p.comments, restricted),
    issues: p.issues
      .filter((i) => !restricted.has(i.authorId))
      .map((i) => ({ ...i, comments: visibleComments(i.comments, restricted) })),
  };
}

export async function listProjects(): Promise<ProjectRecord[]> {
  const [rows, restricted] = await Promise.all([
    sql`SELECT * FROM projects WHERE NOT owner_restricted(owner_type, owner_id) ORDER BY created_at DESC`,
    restrictedIds(),
  ]);
  return rows.map((r) => withVisibleProjectContent(rowToProject(r), restricted));
}

/**
 * The company's own projects — everything owned by the root admin or the
 * Jace Official org. The only projects the site shows (see app/page.tsx and
 * app/projects); anyone else's are kept but hidden.
 */
export async function listCompanyProjects(): Promise<ProjectRecord[]> {
  const rows = await sql`
    SELECT * FROM projects WHERE owner_id IN (${ROOT_ADMIN_ID}, ${SUPPORT_ORG_ID})
    ORDER BY sort_order ASC, created_at ASC
  `;
  return rows.map(rowToProject);
}

export function isCompanyProject(project: Pick<ProjectRecord, "ownerId">): boolean {
  return project.ownerId === ROOT_ADMIN_ID || project.ownerId === SUPPORT_ORG_ID;
}

/** Recent bans/unbans made by Jace's apps (lib/integration.ts), newest first, for the owner's Admin tab. */
export async function listAppModerationLog(limit = 50) {
  const rows = await sql`
    SELECT l.*, u.username AS target_name FROM oauth_moderation_log l
    LEFT JOIN users u ON u.id = l.target_user_id
    ORDER BY l.created_at DESC LIMIT ${limit}
  `;
  return rows.map((r) => ({
    id: r.id as string,
    clientName: r.client_name as string,
    action: r.action as string,
    targetUserId: r.target_user_id as string,
    targetName: (r.target_name as string) ?? undefined,
    reason: r.reason as string,
    createdAt: r.created_at as string,
  }));
}

export async function listProjectsByOwner(ownerId: string): Promise<ProjectRecord[]> {
  const [rows, restricted] = await Promise.all([
    sql`SELECT * FROM projects WHERE owner_id = ${ownerId} AND NOT owner_restricted(owner_type, owner_id) ORDER BY created_at DESC`,
    restrictedIds(),
  ]);
  return rows.map((r) => withVisibleProjectContent(rowToProject(r), restricted));
}

export async function getProjectById(id: string): Promise<ProjectRecord | null> {
  const [rows, restricted] = await Promise.all([
    sql`SELECT * FROM projects WHERE id = ${id} AND NOT owner_restricted(owner_type, owner_id)`,
    restrictedIds(),
  ]);
  return rows[0] ? withVisibleProjectContent(rowToProject(rows[0]), restricted) : null;
}

export async function addProject(record: ProjectRecord): Promise<void> {
  await sql`
    INSERT INTO projects (id, owner_id, owner_type, owner_name, name, description, readme, icon_url, banner_url, versions, created_at)
    VALUES (${record.id}, ${record.ownerId}, ${record.ownerType}, ${record.ownerName}, ${record.name}, ${record.description}, ${record.readme}, ${record.iconUrl}, ${record.bannerUrl ?? null}, ${JSON.stringify(record.versions)}::jsonb, ${record.createdAt})
  `;
}

export type ProjectPatch = Partial<
  Pick<
    ProjectRecord,
    "name" | "description" | "readme" | "iconUrl" | "bannerUrl" | "websiteUrl" | "sourceUrl" | "sortOrder"
  >
>;

export async function updateProject(id: string, patch: ProjectPatch): Promise<void> {
  if (patch.name !== undefined) await sql`UPDATE projects SET name = ${patch.name} WHERE id = ${id}`;
  if (patch.description !== undefined) await sql`UPDATE projects SET description = ${patch.description} WHERE id = ${id}`;
  if (patch.readme !== undefined) await sql`UPDATE projects SET readme = ${patch.readme} WHERE id = ${id}`;
  if (patch.iconUrl !== undefined) await sql`UPDATE projects SET icon_url = ${patch.iconUrl} WHERE id = ${id}`;
  if (patch.bannerUrl !== undefined) await sql`UPDATE projects SET banner_url = ${patch.bannerUrl} WHERE id = ${id}`;
  if (patch.websiteUrl !== undefined) await sql`UPDATE projects SET website_url = ${patch.websiteUrl || null} WHERE id = ${id}`;
  if (patch.sourceUrl !== undefined) await sql`UPDATE projects SET source_url = ${patch.sourceUrl || null} WHERE id = ${id}`;
  if (patch.sortOrder !== undefined) await sql`UPDATE projects SET sort_order = ${patch.sortOrder} WHERE id = ${id}`;
}

export async function deleteProject(id: string): Promise<void> {
  const project = await getProjectById(id);
  if (!project) return;
  await sql`DELETE FROM projects WHERE id = ${id}`;
  await safeDelBlobs([
    project.iconUrl,
    project.bannerUrl,
    ...project.versions.flatMap((v) => [
      ...v.files.map((f) => f.url),
      ...v.sourceFiles.map((f) => f.url),
    ]),
    ...project.comments.map((c) => c.attachment?.url),
    ...project.issues.flatMap((i) => i.comments.map((c) => c.attachment?.url)),
  ]);
}

export async function addProjectVersion(projectId: string, version: ProjectVersion): Promise<void> {
  await sql`
    UPDATE projects SET versions = jsonb_build_array(${JSON.stringify(version)}::jsonb) || versions
    WHERE id = ${projectId}
  `;
}

export async function updateProjectVersion(
  projectId: string,
  versionId: string,
  patch: Partial<
    Pick<ProjectVersion, "label" | "description" | "files" | "sourceFiles">
  > & { downloadUrl?: string | null },
): Promise<void> {
  await sql`
    UPDATE projects SET versions = (
      SELECT jsonb_agg(
        CASE WHEN elem->>'id' = ${versionId} THEN elem || ${JSON.stringify(patch)}::jsonb ELSE elem END
      )
      FROM jsonb_array_elements(versions) elem
    )
    WHERE id = ${projectId}
  `;
}

export async function deleteProjectVersion(projectId: string, versionId: string): Promise<void> {
  await sql`
    UPDATE projects SET versions = (
      SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
      FROM jsonb_array_elements(versions) elem
      WHERE elem->>'id' != ${versionId}
    )
    WHERE id = ${projectId}
  `;
}

export async function addProjectComment(projectId: string, comment: Comment): Promise<void> {
  await sql`
    UPDATE projects SET comments = comments || jsonb_build_array(${JSON.stringify(comment)}::jsonb)
    WHERE id = ${projectId}
  `;
}

export async function deleteProjectComment(projectId: string, commentId: string): Promise<void> {
  await sql`
    UPDATE projects SET comments = (
      SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb) FROM jsonb_array_elements(comments) elem WHERE elem->>'id' != ${commentId}
    ) WHERE id = ${projectId}
  `;
}

export async function pinProjectComment(projectId: string, commentId: string): Promise<void> {
  await sql`
    UPDATE projects SET comments = (
      SELECT jsonb_agg(
        CASE WHEN elem->>'id' = ${commentId} THEN elem || '{"pinned": true}'::jsonb ELSE elem - 'pinned' END
      )
      FROM jsonb_array_elements(comments) elem
    )
    WHERE id = ${projectId}
  `;
}

export async function unpinProjectComment(projectId: string, commentId: string): Promise<void> {
  await sql`
    UPDATE projects SET comments = (
      SELECT jsonb_agg(
        CASE WHEN elem->>'id' = ${commentId} THEN elem - 'pinned' ELSE elem END
      )
      FROM jsonb_array_elements(comments) elem
    )
    WHERE id = ${projectId}
  `;
}

export async function addProjectIssue(projectId: string, issue: ProjectIssue): Promise<void> {
  await sql`
    UPDATE projects SET issues = jsonb_build_array(${JSON.stringify(issue)}::jsonb) || issues
    WHERE id = ${projectId}
  `;
}

export async function updateProjectIssue(
  projectId: string,
  issueId: string,
  patch: Partial<Pick<ProjectIssue, "title" | "body" | "type" | "status">>,
): Promise<void> {
  await sql`
    UPDATE projects SET issues = (
      SELECT jsonb_agg(
        CASE WHEN elem->>'id' = ${issueId} THEN elem || ${JSON.stringify(patch)}::jsonb ELSE elem END
      )
      FROM jsonb_array_elements(issues) elem
    )
    WHERE id = ${projectId}
  `;
}

export async function deleteProjectIssue(projectId: string, issueId: string): Promise<void> {
  await sql`
    UPDATE projects SET issues = (
      SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
      FROM jsonb_array_elements(issues) elem
      WHERE elem->>'id' != ${issueId}
    )
    WHERE id = ${projectId}
  `;
}

export async function addIssueComment(
  projectId: string,
  issueId: string,
  comment: Comment,
): Promise<void> {
  await sql`
    UPDATE projects SET issues = (
      SELECT jsonb_agg(
        CASE WHEN elem->>'id' = ${issueId}
          THEN jsonb_set(elem, '{comments}', (elem->'comments') || jsonb_build_array(${JSON.stringify(comment)}::jsonb))
          ELSE elem
        END
      )
      FROM jsonb_array_elements(issues) elem
    )
    WHERE id = ${projectId}
  `;
}

export async function deleteIssueComment(
  projectId: string,
  issueId: string,
  commentId: string,
): Promise<void> {
  await sql`
    UPDATE projects SET issues = (
      SELECT jsonb_agg(
        CASE WHEN elem->>'id' = ${issueId}
          THEN jsonb_set(elem, '{comments}', (
            SELECT COALESCE(jsonb_agg(c), '[]'::jsonb)
            FROM jsonb_array_elements(elem->'comments') c
            WHERE c->>'id' != ${commentId}
          ))
          ELSE elem
        END
      )
      FROM jsonb_array_elements(issues) elem
    )
    WHERE id = ${projectId}
  `;
}

export async function pinIssueComment(
  projectId: string,
  issueId: string,
  commentId: string,
): Promise<void> {
  await sql`
    UPDATE projects SET issues = (
      SELECT jsonb_agg(
        CASE WHEN elem->>'id' = ${issueId}
          THEN jsonb_set(elem, '{comments}', (
            SELECT jsonb_agg(
              CASE WHEN c->>'id' = ${commentId} THEN c || '{"pinned": true}'::jsonb ELSE c - 'pinned' END
            )
            FROM jsonb_array_elements(elem->'comments') c
          ))
          ELSE elem
        END
      )
      FROM jsonb_array_elements(issues) elem
    )
    WHERE id = ${projectId}
  `;
}

export async function unpinIssueComment(
  projectId: string,
  issueId: string,
  commentId: string,
): Promise<void> {
  await sql`
    UPDATE projects SET issues = (
      SELECT jsonb_agg(
        CASE WHEN elem->>'id' = ${issueId}
          THEN jsonb_set(elem, '{comments}', (
            SELECT jsonb_agg(
              CASE WHEN c->>'id' = ${commentId} THEN c - 'pinned' ELSE c END
            )
            FROM jsonb_array_elements(elem->'comments') c
          ))
          ELSE elem
        END
      )
      FROM jsonb_array_elements(issues) elem
    )
    WHERE id = ${projectId}
  `;
}

// ---------- Orgs ----------

function rowToOrg(row: Record<string, unknown>): OrgRecord {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    imageUrl: (row.image_url as string) ?? undefined,
    bannerUrl: (row.banner_url as string) ?? undefined,
    website: (row.website as string) ?? undefined,
    socialLinks: jsonOrDefault(row.social_links, []),
    ownerId: row.owner_id as string,
    memberIds: jsonOrDefault(row.member_ids, []),
    adminIds: jsonOrDefault(row.admin_ids, []),
    createdAt: row.created_at as string,
  };
}

export async function listOrgs(): Promise<OrgRecord[]> {
  const rows = await sql`SELECT * FROM orgs WHERE NOT owner_restricted('user', owner_id) ORDER BY created_at DESC`;
  return rows.map(rowToOrg);
}

export async function listOrgsForUser(userId: string): Promise<OrgRecord[]> {
  const rows = await sql`SELECT * FROM orgs WHERE member_ids @> ${JSON.stringify([userId])}::jsonb AND NOT owner_restricted('user', owner_id) ORDER BY created_at DESC`;
  return rows.map(rowToOrg);
}

export async function getOrgById(id: string): Promise<OrgRecord | null> {
  const rows = await sql`SELECT * FROM orgs WHERE id = ${id} AND NOT owner_restricted('user', owner_id)`;
  return rows[0] ? rowToOrg(rows[0]) : null;
}

export async function addOrg(record: OrgRecord): Promise<void> {
  await sql`
    INSERT INTO orgs (id, name, description, image_url, banner_url, website, social_links, owner_id, member_ids, admin_ids, created_at)
    VALUES (${record.id}, ${record.name}, ${record.description}, ${record.imageUrl ?? null}, ${record.bannerUrl ?? null}, ${record.website ?? null}, ${JSON.stringify(record.socialLinks ?? [])}::jsonb, ${record.ownerId}, ${JSON.stringify(record.memberIds)}::jsonb, ${JSON.stringify(record.adminIds)}::jsonb, ${record.createdAt})
  `;
}

export type OrgPatch = Partial<
  Pick<OrgRecord, "name" | "description" | "imageUrl" | "bannerUrl" | "website" | "socialLinks">
>;

export async function updateOrg(id: string, patch: OrgPatch): Promise<void> {
  if (patch.name !== undefined) {
    await sql`UPDATE orgs SET name = ${patch.name} WHERE id = ${id}`;
    await cascadeNameChange(id, patch.name, "org");
  }
  if (patch.description !== undefined) await sql`UPDATE orgs SET description = ${patch.description} WHERE id = ${id}`;
  if (patch.imageUrl !== undefined) await sql`UPDATE orgs SET image_url = ${patch.imageUrl} WHERE id = ${id}`;
  if (patch.bannerUrl !== undefined) await sql`UPDATE orgs SET banner_url = ${patch.bannerUrl} WHERE id = ${id}`;
  if (patch.website !== undefined) await sql`UPDATE orgs SET website = ${patch.website} WHERE id = ${id}`;
  if (patch.socialLinks !== undefined) await sql`UPDATE orgs SET social_links = ${JSON.stringify(patch.socialLinks)}::jsonb WHERE id = ${id}`;
}

export async function addOrgMember(orgId: string, userId: string): Promise<void> {
  await sql`
    UPDATE orgs SET member_ids = member_ids || jsonb_build_array(${userId}::text)
    WHERE id = ${orgId} AND NOT (member_ids @> jsonb_build_array(${userId}::text))
  `;
}

export async function removeOrgMember(orgId: string, userId: string): Promise<void> {
  await sql`
    UPDATE orgs SET
      member_ids = (
        SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb) FROM jsonb_array_elements(member_ids) elem WHERE elem != ${JSON.stringify(userId)}::jsonb
      ),
      admin_ids = (
        SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb) FROM jsonb_array_elements(admin_ids) elem WHERE elem != ${JSON.stringify(userId)}::jsonb
      )
    WHERE id = ${orgId}
  `;
}

/** Callers must ensure `userId` is a non-owner member. */
export async function setOrgAdmin(orgId: string, userId: string, admin: boolean): Promise<void> {
  if (admin) {
    await sql`
      UPDATE orgs SET admin_ids = admin_ids || jsonb_build_array(${userId}::text)
      WHERE id = ${orgId} AND NOT (admin_ids @> jsonb_build_array(${userId}::text))
    `;
  } else {
    await sql`
      UPDATE orgs SET admin_ids = (
        SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb) FROM jsonb_array_elements(admin_ids) elem WHERE elem != ${JSON.stringify(userId)}::jsonb
      ) WHERE id = ${orgId}
    `;
  }
}

/** Everyone who can act as this org — the owner plus its admins. */
export function orgStaffIds(org: OrgRecord): string[] {
  return [...new Set([org.ownerId, ...org.adminIds])];
}

export type MessageParty = {
  id: string;
  type: "user" | "org";
  name: string;
  imageUrl?: string;
};

/** Resolves a DM participant id, which can be either a user or an org. */
export async function getMessageParty(id: string): Promise<MessageParty | null> {
  const user = await getUserById(id);
  if (user) return { id, type: "user", name: user.username, imageUrl: user.imageUrl };
  const org = await getOrgById(id);
  if (org) return { id, type: "org", name: org.name, imageUrl: org.imageUrl };
  return null;
}

export async function deleteOrg(id: string): Promise<void> {
  const org = await getOrgById(id);
  if (!org) return;

  const [orgVideoRows, orgProjectRows] = await Promise.all([
    sql`SELECT * FROM videos WHERE owner_type = 'org' AND owner_id = ${id}`,
    sql`SELECT * FROM projects WHERE owner_type = 'org' AND owner_id = ${id}`,
  ]);
  const orgVideos = orgVideoRows.map(rowToVideo);
  const orgProjects = orgProjectRows.map(rowToProject);

  await sql.transaction([
    sql`DELETE FROM orgs WHERE id = ${id}`,
    sql`DELETE FROM videos WHERE owner_type = 'org' AND owner_id = ${id}`,
    sql`DELETE FROM projects WHERE owner_type = 'org' AND owner_id = ${id}`,
  ]);

  await safeDelBlobs([
    org.imageUrl,
    org.bannerUrl,
    ...orgVideos.flatMap((v) => [v.url, v.thumbnailUrl]),
    ...orgProjects.flatMap((p) => [
      p.iconUrl,
      p.bannerUrl,
      ...p.versions.flatMap((v) => [
        ...v.files.map((f) => f.url),
        ...v.sourceFiles.map((f) => f.url),
      ]),
    ]),
  ]);
}

// ---------- Forums ----------

function rowToForum(row: Record<string, unknown>): ForumRecord {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    postPermission: row.post_permission as ForumRecord["postPermission"],
    replyPermission: row.reply_permission as ForumRecord["replyPermission"],
    viewPermission: row.view_permission as ForumRecord["viewPermission"],
    createdAt: row.created_at as string,
  };
}

export async function listForums(): Promise<ForumRecord[]> {
  const rows = await sql`SELECT * FROM forums ORDER BY created_at DESC`;
  return rows.map(rowToForum);
}

export async function getForumById(id: string): Promise<ForumRecord | null> {
  const rows = await sql`SELECT * FROM forums WHERE id = ${id}`;
  return rows[0] ? rowToForum(rows[0]) : null;
}

export async function addForum(record: ForumRecord): Promise<void> {
  await sql`
    INSERT INTO forums (id, name, description, post_permission, reply_permission, view_permission, created_at)
    VALUES (${record.id}, ${record.name}, ${record.description}, ${record.postPermission}, ${record.replyPermission}, ${record.viewPermission}, ${record.createdAt})
  `;
}

export type ForumPermissionPatch = Partial<
  Pick<ForumRecord, "postPermission" | "replyPermission" | "viewPermission" | "name" | "description">
>;

export async function updateForum(id: string, patch: ForumPermissionPatch): Promise<void> {
  if (patch.name !== undefined) await sql`UPDATE forums SET name = ${patch.name} WHERE id = ${id}`;
  if (patch.description !== undefined) await sql`UPDATE forums SET description = ${patch.description} WHERE id = ${id}`;
  if (patch.postPermission !== undefined) await sql`UPDATE forums SET post_permission = ${patch.postPermission} WHERE id = ${id}`;
  if (patch.replyPermission !== undefined) await sql`UPDATE forums SET reply_permission = ${patch.replyPermission} WHERE id = ${id}`;
  if (patch.viewPermission !== undefined) await sql`UPDATE forums SET view_permission = ${patch.viewPermission} WHERE id = ${id}`;
}

export async function deleteForum(id: string): Promise<void> {
  const topicRows = await sql`SELECT * FROM forum_topics WHERE forum_id = ${id}`;
  const topics = topicRows.map(rowToTopic);

  await sql.transaction([
    sql`DELETE FROM forums WHERE id = ${id}`,
    sql`DELETE FROM forum_topics WHERE forum_id = ${id}`,
  ]);

  await safeDelBlobs(
    topics.flatMap((t) => [
      t.attachment?.url,
      ...t.replies.map((r) => r.attachment?.url),
    ]),
  );
}

function rowToTopic(row: Record<string, unknown>): ForumTopic {
  return {
    id: row.id as string,
    forumId: row.forum_id as string,
    title: row.title as string,
    body: row.body as string,
    authorId: row.author_id as string,
    authorType: (row.author_type as ForumTopic["authorType"]) ?? "user",
    authorName: row.author_name as string,
    replies: jsonOrDefault(row.replies, []),
    attachment: (row.attachment as ForumTopic["attachment"]) ?? undefined,
    createdAt: row.created_at as string,
  };
}

function withVisibleReplies(t: ForumTopic, restricted: Set<string>): ForumTopic {
  return restricted.size === 0 ? t : { ...t, replies: t.replies.filter((r) => !restricted.has(r.authorId)) };
}

/**
 * Topics in the READ ME forum (see `lib/constants.ts`) posted after `userId`
 * last dismissed the popup — everything, if they never have. Used to show
 * `ReadmePopup` to new accounts (see everything once) and existing ones
 * (see just what's new) alike.
 */
export async function getUnseenReadmeTopics(userId: string): Promise<ForumTopic[]> {
  const user = await getStoredUserById(userId);
  if (!user) return [];
  const topics = await listTopicsByForum(README_FORUM_ID);
  if (!user.readmeSeenAt) return topics;
  return topics.filter((t) => t.createdAt > user.readmeSeenAt!);
}

export async function markReadmeSeen(userId: string): Promise<void> {
  await sql`UPDATE users SET readme_seen_at = ${new Date().toISOString()} WHERE id = ${userId}`;
}

/** Lets an admin re-show the READ ME popup to everyone, as if it were all new again — see `pushReadmeToEveryoneAction`. */
export async function pushReadmeToEveryone(): Promise<void> {
  await sql`UPDATE users SET readme_seen_at = NULL`;
}

/** Ids of READ ME topics `userId` hasn't seen yet, for `ReadmeWatcher`'s poll — cheaper than fetching full bodies just to detect a change. */
export async function getUnseenReadmeTopicIds(userId: string): Promise<string[]> {
  const topics = await getUnseenReadmeTopics(userId);
  return topics.map((t) => t.id);
}

export async function listTopicsByForum(forumId: string): Promise<ForumTopic[]> {
  const [rows, restricted] = await Promise.all([
    sql`SELECT * FROM forum_topics WHERE forum_id = ${forumId} AND NOT account_restricted(author_id) ORDER BY created_at DESC`,
    restrictedIds(),
  ]);
  return rows.map((r) => withVisibleReplies(rowToTopic(r), restricted));
}

export async function getTopicById(id: string): Promise<ForumTopic | null> {
  const [rows, restricted] = await Promise.all([
    sql`SELECT * FROM forum_topics WHERE id = ${id} AND NOT account_restricted(author_id)`,
    restrictedIds(),
  ]);
  return rows[0] ? withVisibleReplies(rowToTopic(rows[0]), restricted) : null;
}

export async function addTopic(topic: ForumTopic): Promise<void> {
  await sql`
    INSERT INTO forum_topics (id, forum_id, title, body, author_id, author_type, author_name, replies, attachment, created_at)
    VALUES (${topic.id}, ${topic.forumId}, ${topic.title}, ${topic.body}, ${topic.authorId}, ${topic.authorType ?? "user"}, ${topic.authorName}, ${JSON.stringify(topic.replies)}::jsonb, ${topic.attachment ? JSON.stringify(topic.attachment) : null}::jsonb, ${topic.createdAt})
  `;
}

export async function updateTopic(
  id: string,
  patch: Partial<Pick<ForumTopic, "title" | "body">>,
): Promise<void> {
  if (patch.title !== undefined) await sql`UPDATE forum_topics SET title = ${patch.title} WHERE id = ${id}`;
  if (patch.body !== undefined) await sql`UPDATE forum_topics SET body = ${patch.body} WHERE id = ${id}`;
}

export async function deleteTopic(id: string): Promise<void> {
  const topic = await getTopicById(id);
  if (!topic) return;

  await sql`DELETE FROM forum_topics WHERE id = ${id}`;

  await safeDelBlobs([
    topic.attachment?.url,
    ...topic.replies.map((r) => r.attachment?.url),
  ]);
}

export async function addReply(topicId: string, reply: ForumReply): Promise<void> {
  await sql`
    UPDATE forum_topics SET replies = replies || jsonb_build_array(${JSON.stringify(reply)}::jsonb)
    WHERE id = ${topicId}
  `;
}

export async function updateReply(topicId: string, replyId: string, body: string): Promise<void> {
  await sql`
    UPDATE forum_topics SET replies = (
      SELECT COALESCE(jsonb_agg(
        CASE WHEN elem->>'id' = ${replyId} THEN elem || jsonb_build_object('body', ${body}::text) ELSE elem END
      ), '[]'::jsonb)
      FROM jsonb_array_elements(replies) elem
    ) WHERE id = ${topicId}
  `;
}

export async function deleteReply(topicId: string, replyId: string): Promise<void> {
  const topic = await getTopicById(topicId);
  const reply = topic?.replies.find((r) => r.id === replyId);

  await sql`
    UPDATE forum_topics SET replies = (
      SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb) FROM jsonb_array_elements(replies) elem WHERE elem->>'id' != ${replyId}
    ) WHERE id = ${topicId}
  `;

  if (reply?.attachment) await safeDelBlobs([reply.attachment.url]);
}

// ---------- Chat ----------

function rowToChatMessage(row: Record<string, unknown>): ChatMessage {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    userType: (row.user_type as ChatMessage["userType"]) ?? "user",
    userName: row.user_name as string,
    body: row.body as string,
    attachment: (row.attachment as ChatMessage["attachment"]) ?? undefined,
    createdAt: row.created_at as string,
  };
}

export async function listChatMessages(): Promise<ChatMessage[]> {
  const rows = await sql`SELECT * FROM chat_messages WHERE NOT account_restricted(user_id) ORDER BY created_at ASC`;
  const messages = rows.map(rowToChatMessage);
  const avatarUrls = await getOwnerAvatarUrls(
    messages.map((m) => ({ id: m.userId, type: m.userType ?? "user" })),
  );
  return messages.map((m) => ({ ...m, userImageUrl: avatarUrls.get(m.userId) }));
}

export async function addChatMessage(message: ChatMessage): Promise<void> {
  await sql`
    INSERT INTO chat_messages (id, user_id, user_type, user_name, body, attachment, created_at)
    VALUES (${message.id}, ${message.userId}, ${message.userType ?? "user"}, ${message.userName}, ${message.body}, ${message.attachment ? JSON.stringify(message.attachment) : null}::jsonb, ${message.createdAt})
  `;
}

export async function getChatMessageById(id: string): Promise<ChatMessage | null> {
  const rows = await sql`SELECT * FROM chat_messages WHERE id = ${id}`;
  return rows[0] ? rowToChatMessage(rows[0]) : null;
}

export async function deleteChatMessage(id: string): Promise<void> {
  const message = await getChatMessageById(id);
  if (!message) return;
  await sql`DELETE FROM chat_messages WHERE id = ${id}`;
  await safeDelBlobs([message.attachment?.url]);
}

// ---------- Direct messages ----------

export function dmConversationId(userIdA: string, userIdB: string): string {
  return [userIdA, userIdB].sort().join(":");
}

function rowToDm(row: Record<string, unknown>): DirectMessage {
  return {
    id: row.id as string,
    conversationId: row.conversation_id as string,
    fromId: row.from_id as string,
    fromName: row.from_name as string,
    toId: row.to_id as string,
    toName: row.to_name as string,
    body: row.body as string,
    attachment: (row.attachment as DirectMessage["attachment"]) ?? undefined,
    kind: (row.kind as DirectMessage["kind"]) ?? undefined,
    callUrl: (row.call_url as string) ?? undefined,
    createdAt: row.created_at as string,
  };
}

export async function listDmMessages(conversationId: string): Promise<DirectMessage[]> {
  // Messages from a banned/muted account are hidden — except ones to the support org, so appeals stay readable.
  const rows = await sql`
    SELECT * FROM dm_messages
    WHERE conversation_id = ${conversationId}
      AND NOT (account_restricted(from_id) AND to_id != ${SUPPORT_ORG_ID})
    ORDER BY created_at ASC
  `;
  return rows.map(rowToDm);
}

export async function addDmMessage(message: DirectMessage): Promise<void> {
  await sql`
    INSERT INTO dm_messages (id, conversation_id, from_id, from_name, to_id, to_name, body, attachment, kind, call_url, created_at)
    VALUES (${message.id}, ${message.conversationId}, ${message.fromId}, ${message.fromName}, ${message.toId}, ${message.toName}, ${message.body}, ${message.attachment ? JSON.stringify(message.attachment) : null}::jsonb, ${message.kind ?? null}, ${message.callUrl ?? null}, ${message.createdAt})
  `;
}

export async function getDmMessageById(id: string): Promise<DirectMessage | null> {
  const rows = await sql`SELECT * FROM dm_messages WHERE id = ${id}`;
  return rows[0] ? rowToDm(rows[0]) : null;
}

export async function deleteDmMessage(id: string): Promise<void> {
  const message = await getDmMessageById(id);
  if (!message) return;
  await sql`DELETE FROM dm_messages WHERE id = ${id}`;
  await safeDelBlobs([message.attachment?.url]);
}

export type DmConversationSummary = {
  otherId: string;
  otherName: string;
  lastMessage: DirectMessage;
};

export async function listDmConversations(userId: string): Promise<DmConversationSummary[]> {
  const rows = await sql`
    SELECT DISTINCT ON (conversation_id) *,
      (account_restricted(from_id) AND to_id != ${SUPPORT_ORG_ID}) AS hidden,
      (SELECT COALESCE(u.banned, FALSE) FROM users u WHERE u.id = from_id) AS from_banned
    FROM dm_messages
    WHERE from_id = ${userId} OR to_id = ${userId}
    ORDER BY conversation_id, created_at DESC
  `;
  return rows
    .map((row) => {
      const m = rowToDm(row);
      // Keep the conversation in the inbox, but never show a restricted sender's actual text.
      return row.hidden
        ? { ...m, body: restrictedDmNotice(!!row.from_banned), attachment: undefined, kind: undefined, callUrl: undefined }
        : m;
    })
    .map((lastMessage) => ({
      otherId: lastMessage.fromId === userId ? lastMessage.toId : lastMessage.fromId,
      otherName: lastMessage.fromId === userId ? lastMessage.toName : lastMessage.fromName,
      lastMessage,
    }))
    .sort((a, b) => (a.lastMessage.createdAt < b.lastMessage.createdAt ? 1 : -1));
}

// ---------- Group chats ----------

function rowToGroup(row: Record<string, unknown>): GroupChatRecord {
  return {
    id: row.id as string,
    name: row.name as string,
    creatorId: row.creator_id as string,
    memberIds: jsonOrDefault(row.member_ids, []),
    createdAt: row.created_at as string,
  };
}

export async function listGroupChats(): Promise<GroupChatRecord[]> {
  const rows = await sql`SELECT * FROM group_chats ORDER BY created_at DESC`;
  return rows.map(rowToGroup);
}

export async function getGroupChat(id: string): Promise<GroupChatRecord | null> {
  const rows = await sql`SELECT * FROM group_chats WHERE id = ${id}`;
  return rows[0] ? rowToGroup(rows[0]) : null;
}

export async function listGroupChatsForUser(userId: string): Promise<GroupChatRecord[]> {
  const rows = await sql`SELECT * FROM group_chats WHERE member_ids @> ${JSON.stringify([userId])}::jsonb ORDER BY created_at DESC`;
  return rows.map(rowToGroup);
}

export async function addGroupChat(group: GroupChatRecord): Promise<void> {
  await sql`
    INSERT INTO group_chats (id, name, creator_id, member_ids, created_at)
    VALUES (${group.id}, ${group.name}, ${group.creatorId}, ${JSON.stringify(group.memberIds)}::jsonb, ${group.createdAt})
  `;
}

export async function addGroupMember(groupId: string, userId: string): Promise<void> {
  await sql`
    UPDATE group_chats SET member_ids = member_ids || jsonb_build_array(${userId}::text)
    WHERE id = ${groupId} AND NOT (member_ids @> jsonb_build_array(${userId}::text))
  `;
}

export async function removeGroupMember(groupId: string, userId: string): Promise<void> {
  await sql`
    UPDATE group_chats SET member_ids = (
      SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb) FROM jsonb_array_elements(member_ids) elem WHERE elem != ${JSON.stringify(userId)}::jsonb
    ) WHERE id = ${groupId}
  `;
}

function rowToGroupMessage(row: Record<string, unknown>): GroupChatMessage {
  return {
    id: row.id as string,
    groupId: row.group_id as string,
    fromId: row.from_id as string,
    fromName: row.from_name as string,
    body: row.body as string,
    kind: (row.kind as GroupChatMessage["kind"]) ?? undefined,
    callUrl: (row.call_url as string) ?? undefined,
    createdAt: row.created_at as string,
  };
}

export async function listGroupChatMessages(groupId: string): Promise<GroupChatMessage[]> {
  const rows = await sql`SELECT * FROM group_chat_messages WHERE group_id = ${groupId} AND NOT account_restricted(from_id) ORDER BY created_at ASC`;
  return rows.map(rowToGroupMessage);
}

export async function addGroupChatMessage(message: GroupChatMessage): Promise<void> {
  await sql`
    INSERT INTO group_chat_messages (id, group_id, from_id, from_name, body, kind, call_url, created_at)
    VALUES (${message.id}, ${message.groupId}, ${message.fromId}, ${message.fromName}, ${message.body}, ${message.kind ?? null}, ${message.callUrl ?? null}, ${message.createdAt})
  `;
}

export async function lastGroupChatMessages(): Promise<Map<string, GroupChatMessage>> {
  const rows = await sql`
    SELECT DISTINCT ON (group_id) * FROM group_chat_messages WHERE NOT account_restricted(from_id) ORDER BY group_id, created_at DESC
  `;
  const latest = new Map<string, GroupChatMessage>();
  for (const row of rows) {
    const message = rowToGroupMessage(row);
    latest.set(message.groupId, message);
  }
  return latest;
}

/**
 * Recent `call_invite` messages (DM or group) addressed to `userId` — never
 * the ones they sent themselves — created after `sinceIso`. Polled from a
 * site-wide listener so a call is announced no matter what page you're on.
 */
export async function listPendingCallInvites(
  userId: string,
  sinceIso: string,
): Promise<PendingCallInvite[]> {
  const userRows = await sql`SELECT notification_prefs FROM users WHERE id = ${userId}`;
  if (!toNotificationPrefs(userRows[0]?.notification_prefs).calls) return [];

  const [dmRows, myGroups] = await Promise.all([
    sql`
      SELECT * FROM dm_messages
      WHERE to_id = ${userId} AND kind = 'call_invite' AND created_at > ${sinceIso} AND NOT account_restricted(from_id)
      ORDER BY created_at ASC
    `,
    listGroupChatsForUser(userId),
  ]);

  const dmInvites: PendingCallInvite[] = dmRows.map((r) => {
    const m = rowToDm(r);
    return {
      id: m.id,
      fromName: m.fromName,
      callUrl: m.callUrl ?? "",
      createdAt: m.createdAt,
      context: { type: "dm" as const, otherId: m.fromId },
    };
  });

  if (myGroups.length === 0) return dmInvites;

  const groupNames = new Map(myGroups.map((g) => [g.id, g.name]));
  const groupIds = myGroups.map((g) => g.id);
  const groupRows = await sql`
    SELECT * FROM group_chat_messages
    WHERE group_id = ANY(${groupIds}) AND from_id != ${userId} AND kind = 'call_invite' AND created_at > ${sinceIso} AND NOT account_restricted(from_id)
    ORDER BY created_at ASC
  `;
  const groupInvites: PendingCallInvite[] = groupRows.map((r) => {
    const m = rowToGroupMessage(r);
    return {
      id: m.id,
      fromName: m.fromName,
      callUrl: m.callUrl ?? "",
      createdAt: m.createdAt,
      context: {
        type: "group" as const,
        groupId: m.groupId,
        groupName: groupNames.get(m.groupId) ?? "Group",
      },
    };
  });

  return [...dmInvites, ...groupInvites].sort((a, b) =>
    a.createdAt < b.createdAt ? -1 : 1,
  );
}

// ---------- Notifications ----------

const NOTIFICATION_PREF_KEY: Record<NotificationType, keyof NotificationPrefs> = {
  message: "messages",
  video_comment: "videoComments",
  forum_reply: "forumReplies",
};

function rowToNotification(row: Record<string, unknown>): AppNotification {
  return {
    id: row.id as string,
    type: row.type as NotificationType,
    title: row.title as string,
    body: (row.body as string) ?? undefined,
    linkUrl: row.link_url as string,
    createdAt: row.created_at as string,
  };
}

/** Inserts a notification for `userId`, unless they've turned that type off in their preferences. */
export async function notifyUser(
  userId: string,
  notification: { type: NotificationType; title: string; body?: string; linkUrl: string },
): Promise<void> {
  const rows = await sql`SELECT notification_prefs FROM users WHERE id = ${userId}`;
  if (!rows[0]) return;
  const prefs = toNotificationPrefs(rows[0].notification_prefs);
  if (!prefs[NOTIFICATION_PREF_KEY[notification.type]]) return;

  await sql`
    INSERT INTO notifications (id, user_id, type, title, body, link_url, created_at)
    VALUES (
      ${randomUUID()}, ${userId}, ${notification.type}, ${notification.title},
      ${notification.body ?? null}, ${notification.linkUrl}, ${new Date().toISOString()}
    )
  `;
}

export async function listNotificationsSince(
  userId: string,
  sinceIso: string,
): Promise<AppNotification[]> {
  const rows = await sql`
    SELECT * FROM notifications
    WHERE user_id = ${userId} AND created_at > ${sinceIso}
    ORDER BY created_at ASC
  `;
  return rows.map(rowToNotification);
}

// ---------- Reports ----------

function rowToReport(row: Record<string, unknown>): ReportRecord {
  return {
    id: row.id as string,
    reporterId: row.reporter_id as string,
    reporterName: row.reporter_name as string,
    targetType: row.target_type as ReportRecord["targetType"],
    targetId: row.target_id as string,
    ownerId: row.owner_id as string,
    ownerType: row.owner_type as ReportRecord["ownerType"],
    ownerName: row.owner_name as string,
    url: row.url as string,
    excerpt: row.excerpt as string,
    reason: row.reason as ReportRecord["reason"],
    details: row.details as string,
    status: row.status as ReportStatus,
    resolvedById: (row.resolved_by_id as string) ?? undefined,
    resolvedByName: (row.resolved_by_name as string) ?? undefined,
    resolvedAt: (row.resolved_at as string) ?? undefined,
    resolutionNote: (row.resolution_note as string) ?? undefined,
    createdAt: row.created_at as string,
  };
}

export async function addReport(r: ReportRecord): Promise<void> {
  await sql`
    INSERT INTO reports (id, reporter_id, reporter_name, target_type, target_id, owner_id, owner_type, owner_name, url, excerpt, reason, details, status, created_at)
    VALUES (${r.id}, ${r.reporterId}, ${r.reporterName}, ${r.targetType}, ${r.targetId}, ${r.ownerId}, ${r.ownerType}, ${r.ownerName}, ${r.url}, ${r.excerpt}, ${r.reason}, ${r.details}, 'open', ${r.createdAt})
  `;
}

export async function hasOpenReport(reporterId: string, targetType: string, targetId: string): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM reports WHERE reporter_id = ${reporterId} AND target_type = ${targetType} AND target_id = ${targetId} AND status = 'open' LIMIT 1
  `;
  return rows.length > 0;
}

export async function countRecentReportsBy(reporterId: string, sinceIso: string): Promise<number> {
  const rows = await sql`SELECT count(*)::int AS n FROM reports WHERE reporter_id = ${reporterId} AND created_at > ${sinceIso}`;
  return (rows[0]?.n as number) ?? 0;
}

export async function listReports(status: ReportStatus | "closed"): Promise<ReportRecord[]> {
  const rows =
    status === "closed"
      ? await sql`SELECT * FROM reports WHERE status != 'open' ORDER BY resolved_at DESC NULLS LAST, created_at DESC LIMIT 100`
      : await sql`SELECT * FROM reports WHERE status = ${status} ORDER BY created_at ASC`;
  return rows.map(rowToReport);
}

export async function countOpenReports(): Promise<number> {
  const rows = await sql`SELECT count(*)::int AS n FROM reports WHERE status = 'open'`;
  return (rows[0]?.n as number) ?? 0;
}

export async function resolveReport(
  id: string,
  status: "resolved" | "dismissed",
  admin: { id: string; name: string },
  note: string,
): Promise<void> {
  await sql`
    UPDATE reports SET status = ${status}, resolved_by_id = ${admin.id}, resolved_by_name = ${admin.name},
      resolved_at = ${new Date().toISOString()}, resolution_note = ${note || null}
    WHERE id = ${id}
  `;
}

// ---------- Cloud (private per-account file storage) ----------

function rowToCloudFileMeta(row: Record<string, unknown>): CloudFileMeta {
  return {
    id: row.id as string,
    ownerId: row.owner_id as string,
    name: row.name as string,
    contentType: row.content_type as string,
    size: Number(row.size),
    createdAt: row.created_at as string,
  };
}

/** Metadata only — never selects the file bytes. */
export async function listCloudFiles(ownerId: string): Promise<CloudFileMeta[]> {
  const rows = await sql`
    SELECT id, owner_id, name, content_type, size, created_at
    FROM cloud_files WHERE owner_id = ${ownerId} ORDER BY created_at DESC
  `;
  return rows.map(rowToCloudFileMeta);
}

/** Metadata only — never selects the file bytes. */
export async function getCloudFileMeta(id: string): Promise<CloudFileMeta | null> {
  const rows = await sql`
    SELECT id, owner_id, name, content_type, size, created_at FROM cloud_files WHERE id = ${id}
  `;
  return rows[0] ? rowToCloudFileMeta(rows[0]) : null;
}

/** Includes the file bytes — only call this to actually serve a download. */
export async function getCloudFileData(
  id: string,
): Promise<{ meta: CloudFileMeta; data: Buffer } | null> {
  const rows = await sql`SELECT * FROM cloud_files WHERE id = ${id}`;
  if (!rows[0]) return null;
  return { meta: rowToCloudFileMeta(rows[0]), data: rows[0].data as Buffer };
}

export async function addCloudFile(file: CloudFileMeta & { data: Buffer }): Promise<void> {
  await sql`
    INSERT INTO cloud_files (id, owner_id, name, content_type, size, data, created_at)
    VALUES (${file.id}, ${file.ownerId}, ${file.name}, ${file.contentType}, ${file.size}, ${file.data}, ${file.createdAt})
  `;
}

export async function deleteCloudFile(id: string): Promise<void> {
  await sql`DELETE FROM cloud_files WHERE id = ${id}`;
}
