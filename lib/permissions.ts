import "server-only";
import { getOrgById, getStoredUserById, isAdmin, listOrgsForUser } from "./store";
import type { OrgRecord, OwnerType, VideoRecord } from "./types";

/** Any admin (root or granted) can manage any video/project, on top of the
 * owner (or, for an org-owned one, any of its members). */
export async function canManageOwned(
  owner: { ownerId: string; ownerType: OwnerType },
  userId: string,
): Promise<boolean> {
  if (await isAdmin(userId)) return true;
  if (owner.ownerType === "user") return owner.ownerId === userId;
  const org = await getOrgById(owner.ownerId);
  return !!org?.memberIds.includes(userId);
}

/**
 * "public" and "unlisted" videos are viewable by anyone who has the link —
 * only "private" restricts viewing to the owner (or, for an org-owned
 * video, any of its members) and admins, same as `canManageOwned`.
 */
export async function canViewVideo(
  video: VideoRecord,
  userId: string | null | undefined,
): Promise<boolean> {
  if (video.visibility !== "private") return true;
  if (!userId) return false;
  return canManageOwned(video, userId);
}

/**
 * Returns why `userId` can't post new content (a message, comment, topic, or
 * reply) right now, or `null` if they're clear to post. Banned takes priority
 * over muted since it's the stronger restriction. Call this at the top of
 * every content-creation action/route — see e.g. `createReplyAction`.
 */
export async function getPostBlockReason(userId: string, what = "post"): Promise<string | null> {
  const user = await getStoredUserById(userId);
  if (!user) return "Account not found.";
  const until = (iso?: string) => (iso ? ` until ${new Date(iso).toUTCString()}` : "");
  if (user.banned) {
    return `Your account has been banned${until(user.banUntil)}${user.banReason ? `: ${user.banReason}` : "."}`;
  }
  if (user.muted) {
    return `Your account is muted${until(user.muteUntil)} and can't ${what}${user.muteReason ? `: ${user.muteReason}` : "."}`;
  }
  return null;
}

/** The org's owner and its org admins can post and message as the org. */
export function canActAsOrg(org: OrgRecord, userId: string): boolean {
  return org.ownerId === userId || org.adminIds.includes(userId);
}

/** Orgs `userId` can post/message as — for "Post as" pickers. */
export async function listActingOrgs(userId: string): Promise<OrgRecord[]> {
  const orgs = await listOrgsForUser(userId);
  return orgs.filter((o) => canActAsOrg(o, userId));
}

/**
 * Whether `userId` wrote (or, for org-authored content, can speak for the
 * author of) a topic/reply. Site admins are checked separately by callers.
 */
export async function isAuthorOrOrgStaff(
  content: { authorId: string; authorType?: OwnerType },
  userId: string,
): Promise<boolean> {
  if (content.authorType !== "org") return content.authorId === userId;
  const org = await getOrgById(content.authorId);
  return !!org && canActAsOrg(org, userId);
}

export type ResolvedAuthor = { authorId: string; authorName: string; authorType: OwnerType };

/** Picks who a post is authored as: the user themself, or an org they can act as. */
export async function resolveAuthor(
  userId: string,
  userName: string | null | undefined,
  postAsOrgId: string | null | undefined,
): Promise<ResolvedAuthor | { error: string }> {
  if (!postAsOrgId) {
    return { authorId: userId, authorName: userName ?? "Anonymous", authorType: "user" };
  }
  const org = await getOrgById(postAsOrgId);
  if (!org || !canActAsOrg(org, userId)) {
    return { error: "You can't post as that organization." };
  }
  return { authorId: org.id, authorName: org.name, authorType: "org" };
}

export type DmActor = { id: string; name: string; type: OwnerType };

/** Who's sending/viewing DMs: the user, or (with `?as=orgId`) an org they can act as. */
export async function resolveDmActor(
  userId: string,
  userName: string | null | undefined,
  asOrgId: string | null | undefined,
): Promise<DmActor | null> {
  if (!asOrgId) return { id: userId, name: userName ?? "Anonymous", type: "user" };
  const org = await getOrgById(asOrgId);
  if (!org || !canActAsOrg(org, userId)) return null;
  return { id: org.id, name: org.name, type: "org" };
}
