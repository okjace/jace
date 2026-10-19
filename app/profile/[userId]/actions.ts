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
} from "@/lib/store";
import { uploadFile } from "@/lib/storage";
import { isEmailConfigured, sendAccountDeletionEmail } from "@/lib/email";
import { generateToken, hashToken } from "@/lib/tokens";
import type { SocialLink } from "@/lib/types";

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

  const patch: UserProfilePatch = restricted
    ? { defaultVideoTitle, defaultVideoDescription }
    : { bio, website, socialLinks, defaultVideoTitle, defaultVideoDescription };

  const avatarUrlInput = normalizeUrl(String(formData.get("avatarUrl") ?? ""));
  const imageUrl = avatarUrlInput
    ? avatarUrlInput.slice(0, 500)
    : await uploadImage(formData.get("avatar"), "avatars");
  if (imageUrl) patch.imageUrl = imageUrl;

  const bannerUrl = await uploadImage(formData.get("banner"), "banners");
  if (bannerUrl) patch.bannerUrl = bannerUrl;

  await updateUserProfile(userId, patch);
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

async function requireAdmin(): Promise<void> {
  const session = await auth();
  if (!(await isAdmin(session?.user?.id))) throw new Error("Forbidden");
}

export async function banUserAction(targetUserId: string, reason: string): Promise<void> {
  await requireAdmin();
  if (isRootAdmin(targetUserId)) throw new Error("Can't ban the root admin.");

  const trimmed = reason.trim();
  if (!trimmed) throw new Error("A ban reason is required.");

  await banUser(targetUserId, trimmed.slice(0, 500));
  revalidatePath(`/profile/${targetUserId}`);
}

export async function unbanUserAction(targetUserId: string): Promise<void> {
  await requireAdmin();
  await unbanUser(targetUserId);
  revalidatePath(`/profile/${targetUserId}`);
}

export async function muteUserAction(targetUserId: string, reason: string): Promise<void> {
  await requireAdmin();
  if (isRootAdmin(targetUserId)) throw new Error("Can't mute the root admin.");

  const trimmed = reason.trim();
  if (!trimmed) throw new Error("A mute reason is required.");

  await muteUser(targetUserId, trimmed.slice(0, 500));
  revalidatePath(`/profile/${targetUserId}`);
}

export async function unmuteUserAction(targetUserId: string): Promise<void> {
  await requireAdmin();
  await unmuteUser(targetUserId);
  revalidatePath(`/profile/${targetUserId}`);
}
