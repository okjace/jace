-- Jace data schema (Neon Postgres). Run once via scripts/migrate.mjs.
-- Timestamps are stored as TEXT (ISO 8601, via `new Date().toISOString()`)
-- rather than TIMESTAMPTZ so every value round-trips as the exact same JS
-- string the app already works with everywhere (ordering still works, since
-- ISO 8601 strings sort lexicographically in chronological order).

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  password_hash TEXT,
  bio TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  banner_url TEXT,
  website TEXT,
  social_links JSONB NOT NULL DEFAULT '[]',
  default_video_title TEXT,
  default_video_description TEXT,
  email TEXT,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  pending_email TEXT,
  email_verification_token_hash TEXT,
  email_verification_expires_at TEXT,
  password_reset_token_hash TEXT,
  password_reset_expires_at TEXT,
  sign_in_token_hash TEXT,
  sign_in_expires_at TEXT,
  deletion_token_hash TEXT,
  deletion_expires_at TEXT,
  totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  totp_secret TEXT,
  totp_pending_secret TEXT,
  github_id TEXT,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  notification_prefs JSONB NOT NULL DEFAULT '{"calls":true,"messages":true,"videoComments":true,"forumReplies":true}',
  banned BOOLEAN NOT NULL DEFAULT FALSE,
  ban_reason TEXT,
  banned_at TEXT,
  muted BOOLEAN NOT NULL DEFAULT FALSE,
  mute_reason TEXT,
  muted_at TEXT,
  readme_seen_at TEXT,
  theme TEXT NOT NULL DEFAULT 'dark',
  custom_css TEXT,
  theme_color TEXT NOT NULL DEFAULT 'default',
  background JSONB NOT NULL DEFAULT '{"type":"none"}',
  created_at TEXT NOT NULL
);
-- Added in v1.0.16 for databases created before it:
ALTER TABLE users ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'system';
ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_css TEXT;
-- Added in v1.0.17:
ALTER TABLE users ADD COLUMN IF NOT EXISTS theme_color TEXT NOT NULL DEFAULT 'default';
ALTER TABLE users ADD COLUMN IF NOT EXISTS background JSONB NOT NULL DEFAULT '{"type":"none"}';
CREATE UNIQUE INDEX IF NOT EXISTS users_username_ci_idx ON users (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS users_github_id_idx ON users (github_id) WHERE github_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_email_ci_idx ON users (lower(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  pathname TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  thumbnail_url TEXT,
  content_type TEXT NOT NULL,
  size BIGINT NOT NULL,
  owner_id TEXT NOT NULL,
  owner_type TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'public',
  comments JSONB NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS videos_owner_idx ON videos (owner_type, owner_id);

CREATE TABLE IF NOT EXISTS video_likes (
  video_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (video_id, user_id)
);
CREATE INDEX IF NOT EXISTS video_likes_user_idx ON video_likes (user_id);

CREATE TABLE IF NOT EXISTS scores (
  id TEXT PRIMARY KEY,
  game TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  score INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS scores_game_idx ON scores (game);
CREATE INDEX IF NOT EXISTS scores_user_idx ON scores (user_id);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  owner_type TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  readme TEXT NOT NULL DEFAULT '',
  icon_url TEXT NOT NULL DEFAULT '',
  banner_url TEXT,
  website_url TEXT,
  source_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  versions JSONB NOT NULL DEFAULT '[]',
  comments JSONB NOT NULL DEFAULT '[]',
  issues JSONB NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS projects_owner_idx ON projects (owner_type, owner_id);
-- Added in v1.0.18:
ALTER TABLE projects ADD COLUMN IF NOT EXISTS website_url TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ALTER COLUMN theme SET DEFAULT 'dark';

CREATE TABLE IF NOT EXISTS follows (
  follower_id TEXT NOT NULL,
  following_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (follower_id, following_id)
);
CREATE INDEX IF NOT EXISTS follows_following_idx ON follows (following_id);

CREATE TABLE IF NOT EXISTS orgs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  banner_url TEXT,
  website TEXT,
  social_links JSONB NOT NULL DEFAULT '[]',
  owner_id TEXT NOT NULL,
  member_ids JSONB NOT NULL DEFAULT '[]',
  admin_ids JSONB NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS forums (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  post_permission TEXT NOT NULL,
  reply_permission TEXT NOT NULL,
  view_permission TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS forum_topics (
  id TEXT PRIMARY KEY,
  forum_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  author_id TEXT NOT NULL,
  author_type TEXT NOT NULL DEFAULT 'user',
  author_name TEXT NOT NULL,
  replies JSONB NOT NULL DEFAULT '[]',
  attachment JSONB,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS forum_topics_forum_idx ON forum_topics (forum_id);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_type TEXT NOT NULL DEFAULT 'user',
  user_name TEXT NOT NULL,
  body TEXT NOT NULL,
  attachment JSONB,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dm_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  from_id TEXT NOT NULL,
  from_name TEXT NOT NULL,
  to_id TEXT NOT NULL,
  to_name TEXT NOT NULL,
  body TEXT NOT NULL,
  attachment JSONB,
  -- 'call_invite' rows also carry call_url — see lib/callId.ts.
  kind TEXT,
  call_url TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS dm_messages_conversation_idx ON dm_messages (conversation_id);

CREATE TABLE IF NOT EXISTS group_chats (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  creator_id TEXT NOT NULL,
  member_ids JSONB NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS group_chat_messages (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  from_id TEXT NOT NULL,
  from_name TEXT NOT NULL,
  body TEXT NOT NULL,
  kind TEXT,
  call_url TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS group_chat_messages_group_idx ON group_chat_messages (group_id);

-- Cloud: private per-account file storage. Files live as BYTEA rows (no
-- object storage available while the Vercel Blob store is suspended), so
-- callers must never SELECT `data` in a list query — only when serving a
-- single file's bytes for download.
CREATE TABLE IF NOT EXISTS cloud_files (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size BIGINT NOT NULL,
  data BYTEA NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS cloud_files_owner_idx ON cloud_files (owner_id);

-- Voice/video calls (DMs, group chats, and the public chat's voice room) open
-- a Jitsi Meet room in a new tab (see components/calls/CallButton.tsx and
-- lib/callId.ts) — no tables of our own needed, Jitsi's own service hosts
-- the signaling and media.

-- Notifications: a message, a video comment, or a forum reply generates a
-- row here for the recipient, gated by their notification_prefs on `users`
-- (see lib/store.ts's notifyUser). Call notifications instead reuse the
-- call_invite rows on dm_messages/group_chat_messages directly (see
-- listPendingCallInvites) since those already carry everything needed.
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link_url TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at);

-- Reports: users flag content or accounts for admins to review (see
-- app/reports/actions.ts and app/admin/reports/page.tsx). `excerpt` is a
-- snapshot of the reported content taken when the report was filed.
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL,
  reporter_name TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  owner_type TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  url TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  resolved_by_id TEXT,
  resolved_by_name TEXT,
  resolved_at TEXT,
  resolution_note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reports_status_idx ON reports (status, created_at);

-- True when `owner_id` (a user, or an org whose owner is a user) is banned or
-- muted. Videos/projects/orgs of such owners are hidden, not deleted, so they
-- come back when the account is unbanned/unmuted (see lib/store.ts).
CREATE OR REPLACE FUNCTION owner_restricted(p_type TEXT, p_id TEXT) RETURNS BOOLEAN AS $$
  SELECT CASE
    WHEN p_type = 'user' THEN EXISTS (
      SELECT 1 FROM users u WHERE u.id = p_id AND (u.banned OR u.muted))
    WHEN p_type = 'org' THEN EXISTS (
      SELECT 1 FROM orgs o JOIN users u ON u.id = o.owner_id
      WHERE o.id = p_id AND (u.banned OR u.muted))
    ELSE FALSE
  END
$$ LANGUAGE SQL STABLE;

-- True when `p_id` is a banned/muted user, or an org owned by one. Their chat
-- messages, DMs, and forum posts are hidden on read (see lib/store.ts).
CREATE OR REPLACE FUNCTION account_restricted(p_id TEXT) RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM users u WHERE u.id = p_id AND (u.banned OR u.muted))
      OR EXISTS (SELECT 1 FROM orgs o JOIN users u ON u.id = o.owner_id WHERE o.id = p_id AND (u.banned OR u.muted))
$$ LANGUAGE SQL STABLE;

-- ---------- "Sign in with Jace" (OAuth 2.0 authorization-code provider) ----------
-- Lets a Jace account be used to sign in to *other* websites. Any user can
-- register a client for their own site (see app/account/apps); the flow is
-- app/oauth/authorize (browser) -> app/api/oauth/token -> app/api/oauth/userinfo.
-- Secrets/codes/tokens are never stored raw, only a sha256 hash (lib/oauth.ts).

CREATE TABLE IF NOT EXISTS oauth_clients (
  id TEXT PRIMARY KEY,                       -- the public "client_id"
  secret_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL,                    -- the user who registered this app
  redirect_uris JSONB NOT NULL DEFAULT '[]', -- exact-match allowlist
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS oauth_clients_owner_idx ON oauth_clients (owner_id);

-- Authorization codes: single-use, short-lived, minted after the user approves
-- the consent screen and exchanged by the client's server for an access token.
CREATE TABLE IF NOT EXISTS oauth_codes (
  code_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,                -- must match exactly at token exchange
  scope TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_tokens (
  token_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS oauth_tokens_user_idx ON oauth_tokens (user_id);
CREATE INDEX IF NOT EXISTS oauth_tokens_client_idx ON oauth_tokens (client_id);

-- Remembers that a user already approved a client for a given scope, so the
-- consent screen can be skipped on a later sign-in (until the app asks for
-- more scope, or the user disconnects it from Account settings).
CREATE TABLE IF NOT EXISTS oauth_grants (
  user_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, client_id)
);

-- Bans and unbans made by Jace's own apps through app/api/oauth/moderation
-- (see lib/integration.ts), so every one can be traced back to the app.
CREATE TABLE IF NOT EXISTS oauth_moderation_log (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  action TEXT NOT NULL,
  target_user_id TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS oauth_moderation_log_target_idx ON oauth_moderation_log (target_user_id);
