import type { THEME_COLORS } from "./constants";

export type OwnerType = "user" | "org";

/** A single uploaded file attached to a comment, message, or post. */
export type Attachment = {
  name: string;
  url: string;
  /** MIME type — used to decide whether to render an inline image preview. */
  type: string;
  size: number;
};

export type VideoVisibility = "public" | "unlisted" | "private";

export type VideoRecord = {
  id: string;
  url: string;
  pathname: string;
  title: string;
  description: string;
  thumbnailUrl?: string;
  contentType: string;
  size: number;
  ownerId: string;
  ownerType: OwnerType;
  ownerName: string;
  /** "public": shown everywhere. "unlisted": hidden from listings/search but viewable by anyone with the link. "private": only the owner (or, for an org, its members) and admins can view it at all. */
  visibility: VideoVisibility;
  comments: Comment[];
  createdAt: string;
};

export type GameId = "snake" | "memory";

export type ScoreRecord = {
  id: string;
  game: GameId;
  userId: string;
  userName: string;
  /** Not persisted — attached live at read time so it always reflects the player's current avatar. */
  userImageUrl?: string;
  score: number;
  createdAt: string;
};

export type SocialLink = {
  id: string;
  label: string;
  url: string;
};

/** "system" follows the device's light/dark setting. */
export type ThemePreference = "system" | "light" | "dark";

/** One of `THEME_COLORS` in `lib/constants.ts`, or "default" for the plain theme. */
export type ThemeColor = "default" | (typeof THEME_COLORS)[number]["id"];

/** A page background that replaces the theme's: a solid color or an image. */
export type CustomBackground =
  | { type: "none" }
  | { type: "color"; color: string }
  | { type: "image"; imageUrl: string; /** Lays the theme color over the image so text stays readable. */ fade: boolean };

export type NotificationPrefs = {
  calls: boolean;
  messages: boolean;
  videoComments: boolean;
  forumReplies: boolean;
};

export type StoredUser = {
  id: string;
  username: string;
  /** Absent for accounts that only ever signed in via an OAuth provider. */
  passwordHash?: string;
  bio: string;
  imageUrl?: string;
  bannerUrl?: string;
  website?: string;
  socialLinks?: SocialLink[];
  defaultVideoTitle?: string;
  defaultVideoDescription?: string;

  email?: string;
  emailVerified?: boolean;
  /** New address awaiting a click on its verification link. */
  pendingEmail?: string;
  emailVerificationTokenHash?: string;
  emailVerificationExpiresAt?: string;

  passwordResetTokenHash?: string;
  passwordResetExpiresAt?: string;

  /** Passwordless "sign in with email" magic link. */
  signInTokenHash?: string;
  signInExpiresAt?: string;

  deletionTokenHash?: string;
  deletionExpiresAt?: string;

  totpEnabled?: boolean;
  totpSecret?: string;
  /** Set while the user is scanning the QR code but hasn't confirmed a code yet. */
  totpPendingSecret?: string;

  /** Stable GitHub account id (`account.providerAccountId`), once linked. */
  githubId?: string;

  /** Granted by the root admin (see `lib/constants.ts`) — the root itself is always an admin regardless of this flag. */
  isAdmin?: boolean;

  /** Defaults filled in by `lib/store.ts`'s `rowToStoredUser` when reading — absent only on a not-yet-persisted object literal like `registerAction`'s. */
  notificationPrefs?: NotificationPrefs;

  /** Blocks sign-in entirely (see `lib/permissions.ts`'s `getPostBlockReason` and `auth.ts`'s `AccountBannedError`). The root admin can never be banned. */
  banned?: boolean;
  banReason?: string;
  bannedAt?: string;

  /** Blocks posting new content (messages, comments, topics, replies) but not signing in or browsing. */
  muted?: boolean;
  muteReason?: string;
  mutedAt?: string;

  /** When this account last dismissed the READ ME forum popup — absent means "never" (shows everything posted so far). See `lib/constants.ts`'s `README_FORUM_ID`. */
  readmeSeenAt?: string;

  /** Site appearance for this account (see `app/layout.tsx`); absent means "system". */
  theme?: ThemePreference;
  themeColor?: ThemeColor;
  background?: CustomBackground;
  /** The user's own stylesheet, applied site-wide only while they're signed in. */
  customCss?: string;

  createdAt: string;
};

/** Admin-only view of a user's ban/mute state — never exposed via `PublicUser`. */
export type ModerationStatus = {
  banned: boolean;
  banReason?: string;
  bannedAt?: string;
  muted: boolean;
  muteReason?: string;
  mutedAt?: string;
};

/** Safe to hand to any caller — never includes credentials, tokens, or contact info. */
export type PublicUser = Omit<
  StoredUser,
  | "passwordHash"
  | "customCss"
  | "themeColor"
  | "background"
  | "email"
  | "emailVerified"
  | "pendingEmail"
  | "emailVerificationTokenHash"
  | "emailVerificationExpiresAt"
  | "passwordResetTokenHash"
  | "passwordResetExpiresAt"
  | "signInTokenHash"
  | "signInExpiresAt"
  | "deletionTokenHash"
  | "deletionExpiresAt"
  | "totpEnabled"
  | "totpSecret"
  | "totpPendingSecret"
  | "githubId"
  | "banned"
  | "banReason"
  | "bannedAt"
  | "muted"
  | "muteReason"
  | "mutedAt"
>;

/** Returned only to the account owner themselves, on the account settings page. */
export type AccountDetails = {
  id: string;
  username: string;
  hasPassword: boolean;
  email?: string;
  emailVerified: boolean;
  pendingEmail?: string;
  totpEnabled: boolean;
  notificationPrefs: NotificationPrefs;
  theme: ThemePreference;
  themeColor: ThemeColor;
  background: CustomBackground;
  customCss: string;
};

export type ProjectFile = {
  id: string;
  name: string;
  url: string;
  size: number;
};

export type ProjectVersion = {
  id: string;
  label: string;
  description: string;
  files: ProjectFile[];
  sourceFiles: ProjectFile[];
  /** External download link (e.g. a GitHub Release) for files too large to host directly. */
  downloadUrl?: string;
  createdAt: string;
};

export type Comment = {
  id: string;
  body: string;
  authorId: string;
  authorName: string;
  /** At most one comment per list is pinned at a time. */
  pinned?: boolean;
  attachment?: Attachment;
  createdAt: string;
};

export type IssueType = "bug" | "feature";
export type IssueStatus = "open" | "closed";

export type ProjectIssue = {
  id: string;
  title: string;
  body: string;
  type: IssueType;
  status: IssueStatus;
  authorId: string;
  authorName: string;
  comments: Comment[];
  createdAt: string;
};

export type ProjectRecord = {
  id: string;
  ownerId: string;
  ownerType: OwnerType;
  ownerName: string;
  name: string;
  description: string;
  /** Long-form Markdown writeup, rendered like a README — separate from the short `description`. */
  readme: string;
  iconUrl: string;
  bannerUrl?: string;
  /** Where to use it (its own site, store page, download page). */
  websiteUrl?: string;
  /** Where its code lives, e.g. a GitHub repo. */
  sourceUrl?: string;
  /** Position on the home page and /projects, lowest first. */
  sortOrder: number;
  versions: ProjectVersion[];
  comments: Comment[];
  issues: ProjectIssue[];
  createdAt: string;
};

export type OrgRecord = {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  bannerUrl?: string;
  website?: string;
  socialLinks?: SocialLink[];
  ownerId: string;
  memberIds: string[];
  /** Members (never the owner, who can always do this) who can post and message as the org. */
  adminIds: string[];
  createdAt: string;
};

export type ForumPermission = "everyone" | "adminOnly";

export type ForumRecord = {
  id: string;
  name: string;
  description: string;
  /** Who can create new topics. */
  postPermission: ForumPermission;
  /** Who can reply to existing topics. */
  replyPermission: ForumPermission;
  viewPermission: ForumPermission;
  createdAt: string;
};

export type ForumReply = {
  id: string;
  body: string;
  /** A user id, or an org id when `authorType` is "org". */
  authorId: string;
  authorType?: OwnerType;
  authorName: string;
  attachment?: Attachment;
  createdAt: string;
};

export type ForumTopic = {
  id: string;
  forumId: string;
  title: string;
  body: string;
  authorId: string;
  authorType?: OwnerType;
  authorName: string;
  replies: ForumReply[];
  attachment?: Attachment;
  createdAt: string;
};

export type ChatMessage = {
  id: string;
  /** A user id, or an org id when `userType` is "org". */
  userId: string;
  userType?: OwnerType;
  userName: string;
  /** Not persisted — attached live at read time so it always reflects the sender's current avatar. */
  userImageUrl?: string;
  body: string;
  attachment?: Attachment;
  createdAt: string;
};

export type DirectMessage = {
  id: string;
  conversationId: string;
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  body: string;
  attachment?: Attachment;
  /** Set on the system message a call button posts announcing a call. */
  kind?: "call_invite";
  callUrl?: string;
  createdAt: string;
};

export type GroupChatRecord = {
  id: string;
  name: string;
  creatorId: string;
  memberIds: string[];
  createdAt: string;
};

export type GroupChatMessage = {
  id: string;
  groupId: string;
  fromId: string;
  fromName: string;
  body: string;
  kind?: "call_invite";
  callUrl?: string;
  createdAt: string;
};

/** A recent call_invite message somewhere the current user should be notified about. */
export type PendingCallInvite = {
  id: string;
  fromName: string;
  callUrl: string;
  createdAt: string;
  context: { type: "dm"; otherId: string } | { type: "group"; groupId: string; groupName: string };
};

export type NotificationType = "message" | "video_comment" | "forum_reply";

/** A notification row for a new message, video comment, or forum reply — see `lib/store.ts`'s `notifyUser`. */
export type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  body?: string;
  linkUrl: string;
  createdAt: string;
};

/** Metadata only — the file's bytes are never included here. */
export type CloudFileMeta = {
  id: string;
  ownerId: string;
  name: string;
  contentType: string;
  size: number;
  createdAt: string;
};


export type ReportTargetType =
  | "user"
  | "video"
  | "video_comment"
  | "forum_topic"
  | "forum_reply"
  | "chat_message";

export type ReportReason = "spam" | "harassment" | "inappropriate" | "other";
export type ReportStatus = "open" | "resolved" | "dismissed";

export type ReportRecord = {
  id: string;
  reporterId: string;
  reporterName: string;
  targetType: ReportTargetType;
  /** Composite ids ("topicId:replyId", "videoId:commentId") for nested targets. */
  targetId: string;
  /** Who wrote/owns the reported content — a user id, or an org id when `ownerType` is "org". */
  ownerId: string;
  ownerType: OwnerType;
  ownerName: string;
  /** Where to see the content. */
  url: string;
  /** Snapshot taken at report time so admins still see it if it's later edited or deleted. */
  excerpt: string;
  reason: ReportReason;
  details: string;
  status: ReportStatus;
  resolvedById?: string;
  resolvedByName?: string;
  resolvedAt?: string;
  resolutionNote?: string;
  createdAt: string;
};

// ---------- "Sign in with Jace" (OAuth apps) ----------

/** A registered "Sign in with Jace" app. Never carries the secret itself — see `lib/oauth.ts`. */
export type OAuthClient = {
  id: string;
  name: string;
  ownerId: string;
  redirectUris: string[];
  /** Registered by the site owner — see `isOfficialClient` in lib/oauth.ts. */
  official: boolean;
  createdAt: string;
};

/** An app a user has approved, shown under Account settings → Connected apps. */
export type OAuthGrant = {
  clientId: string;
  clientName: string;
  scope: string;
  createdAt: string;
};
