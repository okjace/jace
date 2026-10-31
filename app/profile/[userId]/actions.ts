"use server";

import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { auth, signOut } from "@/auth";
import { isRootAdmin } from "@/lib/constants";
import {
  awaitReadYourWrite,
  banUser,
  DATA_CATEGORIES,
  type DataCategory,
  deleteUserAccount,
  deleteUserData,
  followUser,
  getModerationStatus,
  getStoredUserById,
  getUserById,
  isAdmin,
  isFollowing,
  muteUser,
  requestAccountDeletion,
  unbanUser,
  unfollowUser,
  unmuteUser,
  updateUserProfile,
  type UserProfilePatch,
  recordHistory,
  type HistoryActor,
} from "@/lib/store";
import { uploadFile } from "@/lib/storage";
import type { RestrictionOptions } from "@/lib/types";
import { notifyUserUpdated } from "@/lib/webhooks";
import { isEmailConfigured, sendAccountDeletionEmail } from "@/lib/email";
import { generateToken, hashToken } from "@/lib/tokens";
import type { SocialLink } from "@/lib/types";
import { checkAutomod, checkImages } from "@/lib/automod";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function parseSocialLinks(raw: string): SocialLink[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (l): l is { label: unknown; url: unknown } =>
          !!l && typeof l === "object",
      )
      .map((l) => ({
        id: randomUUID(),
        label: String(l.label ?? "").slice(0, 40),
        url: normalizeUrl(String(l.url ?? "")).slice(0, 300),
      }))
      .filter((l) => l.label && l.url)
      .slice(0, 10);
  } catch {
    return [];
  }
}

async function uploadImage(
  file: FormDataEntryValue | null,
  pathPrefix: string,
): Promise<string | undefined> {
  if (!(file instanceof File) || file.size === 0) return undefined;
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Images must be 4MB or smaller.");
  }
  if (!file.type.startsWith("image/")) {
    throw new Error("File must be an image.");
  }
  return uploadFile(`${pathPrefix}/${randomUUID()}`, file, file.type);
}

export async function updateProfile(userId: string, formData: FormData) {
  const session = await auth();
  if (session?.user?.id !== userId) {
    throw new Error("Unauthorized");
  }

  const bio = String(formData.get("bio") ?? "").slice(0, 500);
  const website = normalizeUrl(String(formData.get("website") ?? "")).slice(
    0,
    200,
  );
  const socialLinks = parseSocialLinks(String(formData.get("socialLinks") ?? "[]"));
  const defaultVideoTitle = String(formData.get("defaultVideoTitle") ?? "")
    .trim()
    .slice(0, 140);
  const defaultVideoDescription = String(
    formData.get("defaultVideoDescription") ?? "",
  )
    .trim()
    .slice(0, 2000);

  // Muted/banned accounts can't change their bio, website, or social links.
  const status = await getModerationStatus(userId);
  const restricted = !!(status?.banned || status?.muted);

  if (!restricted) {
    const automod = await checkAutomod(
      userId,
      "a profile",
      bio,
      website,
      ...socialLinks.flatMap((l) => [l.label, l.url]),
    );
    if (automod) throw new Error(automod);
  }

  const patch: UserProfilePatch = restricted
    ? { defaultVideoTitle, defaultVideoDescription }
    : { bio, website, socialLinks, defaultVideoTitle, defaultVideoDescription };

  const avatarUrlInput = normalizeUrl(String(formData.get("avatarUrl") ?? ""));
  const newImage =
    !!avatarUrlInput ||
    [formData.get("avatar"), formData.get("banner")].some((f) => f instanceof File && f.size > 0);
  const imageBlocked = await checkImages(userId, "a profile picture or banner", "profile", newImage);
  if (imageBlocked) throw new Error(imageBlocked);
  const imageUrl = avatarUrlInput
    ? avatarUrlInput.slice(0, 500)
    : await uploadImage(formData.get("avatar"), "avatars");
  if (imageUrl) patch.imageUrl = imageUrl;

  const bannerUrl = await uploadImage(formData.get("banner"), "banners");
  if (bannerUrl) patch.bannerUrl = bannerUrl;

  await updateUserProfile(userId, patch);
  if (patch.imageUrl) await recordHistory(userId, "picture_changed", "Changed their profile picture", { kind: "self" });
  if (patch.bannerUrl) await recordHistory(userId, "banner_changed", "Changed their profile banner", { kind: "self" });
  if (patch.imageUrl) notifyUserUpdated(userId, ["picture"]);
  revalidatePath(`/profile/${userId}`);
  revalidatePath("/profile");
}

/**
 * Emails a confirmation link rather than deleting immediately — the actual
 * deletion happens when that link is clicked (see /delete-account/[token]).
 */
export async function requestAccountDeletionAction(
  userId: string,
): Promise<{ error?: string; sent?: boolean }> {
  const session = await auth();
  if (session?.user?.id !== userId) {
    throw new Error("Unauthorized");
  }

  if (!isEmailConfigured()) {
    return {
      error:
        "Email isn't configured for this app yet, so deletion can't be confirmed by email. Ask the admin to set it up.",
    };
  }

  const user = await getStoredUserById(userId);
  if (!user?.email || !user.emailVerified) {
    return {
      error:
        "Add and verify an email address in Account settings first — deletion is confirmed by email.",
    };
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await requestAccountDeletion(userId, hashToken(token), expiresAt);

  try {
    await sendAccountDeletionEmail(user.email, user.username, token);
  } catch (err) {
    return {
      error: `Couldn't send the confirmation email: ${err instanceof Error ? err.message : "unknown error"}.`,
    };
  }

  return { sent: true };
}

/**
 * Accounts with no email on file have no address to send a confirmation
 * link to, so deletion is confirmed by password instead and happens right
 * away (no separate confirm step, since typing the right password already
 * proves it). Accounts with a password-less sign-in (GitHub only, no email)
 * have nothing to check, so the confirm dialog before this is called is the
 * only gate.
 */
export async function deleteAccountWithPasswordAction(
  userId: string,
  password: string,
): Promise<{ error?: string }> {
  const session = await auth();
  if (session?.user?.id !== userId) {
    throw new Error("Unauthorized");
  }

  const user = await getStoredUserById(userId);
  if (!user) throw new Error("Account not found.");
  if (user.email) {
    return {
      error: "This account has an email on file — delete using the emailed confirmation link instead.",
    };
  }
  if (user.passwordHash) {
    if (!password) return { error: "Enter your password." };
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return { error: "Incorrect password." };
  }

  await deleteUserAccount(userId);
  await awaitReadYourWrite(async () => (await getUserById(userId)) === null);
  await signOut({ redirect: false });

  return {};
}

/** Deletes one category of the signed-in user's own data, keeping the account — see "Your data" in profile settings. */
export async function deleteMyDataAction(
  userId: string,
  category: string,
): Promise<{ error?: string; count?: number }> {
  const session = await auth();
  if (session?.user?.id !== userId) throw new Error("Unauthorized");
  if (!(DATA_CATEGORIES as readonly string[]).includes(category)) {
    return { error: "Unknown kind of data." };
  }
  const count = await deleteUserData(userId, category as DataCategory);
  if (category === "profile") notifyUserUpdated(userId, ["picture"]);
  revalidatePath(`/profile/${userId}`);
  return { count };
}

export async function toggleFollowAction(targetUserId: string): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  if (session.user.id === targetUserId) throw new Error("Can't follow yourself.");

  const alreadyFollowing = await isFollowing(session.user.id, targetUserId);
  if (alreadyFollowing) {
    await unfollowUser(session.user.id, targetUserId);
  } else {
    await followUser(session.user.id, targetUserId);
  }

  revalidatePath(`/profile/${targetUserId}`);
  revalidatePath(`/profile/${session.user.id}`);
  return !alreadyFollowing;
}

/** Checks the caller is a Jace admin and returns them, for the account history. */
async function requireAdmin(): Promise<HistoryActor> {
  const session = await auth();
  if (!session?.user?.id || !(await isAdmin(session.user.id))) throw new Error("Forbidden");
  return { kind: "admin", id: session.user.id, name: session.user.name ?? "admin" };
}

function lengthText(durationMinutes: number | null): string {
  if (!durationMinutes) return "permanently";
  const days = durationMinutes / (24 * 60);
  if (Number.isInteger(days)) return `for ${days} day${days === 1 ? "" : "s"}`;
  const hours = durationMinutes / 60;
  if (Number.isInteger(hours)) return `for ${hours} hour${hours === 1 ? "" : "s"}`;
  return `for ${durationMinutes} minute${durationMinutes === 1 ? "" : "s"}`;
}

/** Longest timed ban or mute: 10 years. Longer than that, choose Permanent. */
const MAX_RESTRICTION_MINUTES = 10 * 365 * 24 * 60;

function checkRestriction(options: RestrictionOptions, what: "ban" | "mute"): { reason: string; durationMinutes: number | null } {
  const reason = String(options.reason ?? "").trim().slice(0, 500);
  if (!reason) throw new Error(`A ${what} reason is required.`);
  const minutes = options.durationMinutes;
  if (minutes !== null) {
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_RESTRICTION_MINUTES) {
      throw new Error("Pick how long it lasts (1 minute to 10 years), or Permanent.");
    }
  }
  return { reason, durationMinutes: minutes };
}

export async function banUserAction(targetUserId: string, options: RestrictionOptions): Promise<void> {
  const admin = await requireAdmin();
  if (isRootAdmin(targetUserId)) throw new Error("Can't ban the root admin.");
  const { reason, durationMinutes } = checkRestriction(options, "ban");
  await banUser(targetUserId, reason, {
    durationMinutes,
    appealable: options.appealable !== false,
    canSignOut: options.canSignOut !== false,
  });
  await recordHistory(
    targetUserId,
    "banned",
    `Banned ${lengthText(durationMinutes)}: ${reason}${options.appealable === false ? " (no appeals)" : ""}${options.canSignOut === false ? " (Sign out hidden)" : ""}`,
    admin,
  );
  revalidatePath(`/profile/${targetUserId}`);
}

export async function unbanUserAction(targetUserId: string): Promise<void> {
  const admin = await requireAdmin();
  await unbanUser(targetUserId);
  await recordHistory(targetUserId, "unbanned", "Unbanned", admin);
  revalidatePath(`/profile/${targetUserId}`);
}

export async function muteUserAction(targetUserId: string, options: RestrictionOptions): Promise<void> {
  const admin = await requireAdmin();
  if (isRootAdmin(targetUserId)) throw new Error("Can't mute the root admin.");
  const { reason, durationMinutes } = checkRestriction(options, "mute");
  await muteUser(targetUserId, reason, { durationMinutes, appealable: options.appealable !== false });
  await recordHistory(
    targetUserId,
    "muted",
    `Muted ${lengthText(durationMinutes)}: ${reason}${options.appealable === false ? " (no appeals)" : ""}`,
    admin,
  );
  revalidatePath(`/profile/${targetUserId}`);
}

export async function unmuteUserAction(targetUserId: string): Promise<void> {
  const admin = await requireAdmin();
  await unmuteUser(targetUserId);
  await recordHistory(targetUserId, "unmuted", "Unmuted", admin);
  revalidatePath(`/profile/${targetUserId}`);
}
