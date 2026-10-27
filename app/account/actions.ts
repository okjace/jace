"use server";

import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { AuthError } from "next-auth";
import { revalidatePath } from "next/cache";
import { auth, signIn, signOut, TotpInvalidError, TotpRequiredError } from "@/auth";
import { isRootAdmin, MAX_CUSTOM_CSS_LENGTH, THEME_COLORS } from "@/lib/constants";
import {
  activateSavedAccount,
  ADD_ACCOUNT_COMPLETE_PATH,
  clearAddingAccount,
  getActiveSession,
  markAddingAccount,
  removeSavedAccount,
  upsertAccount,
} from "@/lib/accountSwitcher";
import {
  changeUsername,
  confirmTotpEnrollment,
  disableTotp,
  getModerationStatus,
  getStoredUserById,
  getUserByEmail,
  getUserByUsername,
  isUsernameTaken,
  requestEmailChange,
  setPasswordHash,
  setUserAdmin,
  startTotpEnrollment,
  setDisplayName,
  updateAppearance,
  updateNotificationPrefs,
} from "@/lib/store";
import { isEmailConfigured, sendVerificationEmail } from "@/lib/email";
import { revokeGrant } from "@/lib/oauth";
import { notifyUserUpdated } from "@/lib/webhooks";
import { cleanDisplayName, MAX_DISPLAY_NAME_LENGTH } from "@/lib/format";
import type { CustomBackground } from "@/lib/types";
import { generateToken, hashToken } from "@/lib/tokens";
import { buildTotpUri, generateTotpSecret, verifyTotpCode } from "@/lib/totp";
import { checkAutomod } from "@/lib/automod";

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

type ActionState = { error?: string; success?: string };

export async function changeUsernameAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  const username = String(formData.get("username") ?? "").trim();

  if (!USERNAME_RE.test(username)) {
    return {
      error: "Username must be 3-20 characters: letters, numbers, or underscores.",
    };
  }
  if (await isUsernameTaken(username, userId)) {
    return { error: "That username is taken." };
  }
  const automod = await checkAutomod(userId, "a username", username);
  if (automod) return { error: automod };

  await changeUsername(userId, username);
  notifyUserUpdated(userId, ["username"]);
  revalidatePath("/profile/[userId]", "page");
  revalidatePath(`/profile/${userId}`);
  return { success: "Username updated." };
}

export async function changeDisplayNameAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  // Like the bio, a muted or banned account's public name is frozen.
  const status = await getModerationStatus(userId);
  if (status?.banned || status?.muted) {
    return { error: "Your display name can't be changed while your account is muted or banned." };
  }
  const displayName = cleanDisplayName(String(formData.get("displayName") ?? ""));
  if (displayName && [...displayName].length > MAX_DISPLAY_NAME_LENGTH) {
    return { error: `Display names can be at most ${MAX_DISPLAY_NAME_LENGTH} characters.` };
  }

  if (displayName) {
    const automod = await checkAutomod(userId, "a display name", displayName);
    if (automod) return { error: automod };
  }
  await setDisplayName(userId, displayName);
  notifyUserUpdated(userId, ["display_name"]);
  revalidatePath("/", "layout");
  return { success: displayName ? "Display name updated." : "Display name removed. Your username is shown instead." };
}

export async function requestEmailChangeAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!EMAIL_RE.test(email)) {
    return { error: "Enter a valid email address." };
  }

  const existing = await getUserByEmail(email);
  if (existing && existing.id !== userId) {
    return { error: "That email is already in use by another account." };
  }

  if (!isEmailConfigured()) {
    return {
      error: "Email sending isn't configured for this app yet — ask the admin to set it up.",
    };
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await requestEmailChange(userId, email, hashToken(token), expiresAt);

  const user = await getStoredUserById(userId);
  try {
    await sendVerificationEmail(email, user?.username ?? "there", token);
  } catch (err) {
    return {
      error: `Couldn't send the verification email: ${err instanceof Error ? err.message : "unknown error"}.`,
    };
  }

  revalidatePath("/profile/[userId]", "page");
  return { success: "Check your inbox to confirm this email address." };
}

export async function changePasswordAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");

  if (newPassword.length < 8) {
    return { error: "New password must be at least 8 characters." };
  }

  const user = await getStoredUserById(userId);
  if (!user) throw new Error("Account not found.");

  if (user.passwordHash) {
    if (!currentPassword) {
      return { error: "Enter your current password." };
    }
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return { error: "Current password is incorrect." };
    }
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await setPasswordHash(userId, passwordHash);
  revalidatePath("/profile/[userId]", "page");
  return {
    success: user.passwordHash
      ? "Password updated."
      : "Password set — you can now sign in with your username and password too.",
  };
}

export async function startTotpEnrollmentAction(): Promise<{
  secret: string;
  qrDataUrl: string;
}> {
  const userId = await requireUserId();
  const user = await getStoredUserById(userId);
  if (!user) throw new Error("Account not found.");

  // Reuse an already-pending secret instead of overwriting it: if the user
  // scanned the QR and then reloaded (or clicked "Enable 2FA" again) before
  // confirming, generating a fresh secret here would silently invalidate
  // what's already in their authenticator app, and every confirm attempt
  // would fail with "Invalid code" for no visible reason.
  const secret = user.totpPendingSecret ?? generateTotpSecret();
  if (!user.totpPendingSecret) {
    await startTotpEnrollment(userId, secret);
  }
  const uri = buildTotpUri(secret, user.username);
  const qrDataUrl = await QRCode.toDataURL(uri);
  return { secret, qrDataUrl };
}

export async function confirmTotpEnrollmentAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  const code = String(formData.get("code") ?? "").trim();

  // The pending secret was written moments ago (when the QR code was shown)
  // and this read hits the same CDN-fronted JSON store, which can briefly
  // serve a stale copy that predates that write. Retry before telling the
  // user to start over.
  const delays = [0, 500, 1000, 1500, 2500, 4000, 5000, 6000];
  let user = await getStoredUserById(userId);
  for (let i = 0; i < delays.length && !user?.totpPendingSecret; i++) {
    await new Promise((resolve) => setTimeout(resolve, delays[i]));
    user = await getStoredUserById(userId);
  }
  if (!user?.totpPendingSecret) {
    return { error: "Start enrollment again." };
  }
  if (!verifyTotpCode(user.totpPendingSecret, code)) {
    return { error: "Invalid code. Try again." };
  }

  await confirmTotpEnrollment(userId);
  revalidatePath("/profile/[userId]", "page");
  return { success: "Two-factor authentication enabled." };
}

export async function disableTotpAction(): Promise<void> {
  const userId = await requireUserId();
  await disableTotp(userId);
  revalidatePath("/profile/[userId]", "page");
}

export async function updateNotificationPrefsAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();

  await updateNotificationPrefs(userId, {
    calls: formData.get("calls") === "on",
    messages: formData.get("messages") === "on",
    videoComments: formData.get("videoComments") === "on",
    forumReplies: formData.get("forumReplies") === "on",
  });

  revalidatePath("/profile/[userId]", "page");
  revalidatePath(`/profile/${userId}`);
  return { success: "Notification preferences saved." };
}

export async function updateAppearanceAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();

  const themeInput = String(formData.get("theme") ?? "system");
  const theme = themeInput === "light" || themeInput === "dark" ? themeInput : "system";
  const customCss = String(formData.get("customCss") ?? "").trim();
  if (customCss.length > MAX_CUSTOM_CSS_LENGTH) {
    return { error: `Custom CSS must be ${MAX_CUSTOM_CSS_LENGTH.toLocaleString()} characters or fewer.` };
  }

  const colorInput = String(formData.get("themeColor") ?? "default");
  const themeColor = THEME_COLORS.find((c) => c.id === colorInput)?.id ?? "default";

  let background: CustomBackground = { type: "none" };
  const backgroundType = String(formData.get("backgroundType") ?? "none");
  if (backgroundType === "color") {
    const color = String(formData.get("backgroundColor") ?? "").trim().toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(color)) return { error: "Pick a background color." };
    background = { type: "color", color };
  } else if (backgroundType === "image") {
    const raw = String(formData.get("backgroundImageUrl") ?? "").trim();
    let imageUrl: string;
    try {
      const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
      imageUrl = url.href;
    } catch {
      return { error: "Upload an image or paste a valid image URL." };
    }
    if (!raw || imageUrl.length > 2000) {
      return { error: "Upload an image or paste a valid image URL." };
    }
    background = { type: "image", imageUrl, fade: formData.get("backgroundFade") === "on" };
  }

  await updateAppearance(userId, { theme, themeColor, background, customCss });

  // The theme and stylesheet are applied by the root layout, so every page changes.
  revalidatePath("/", "layout");
  return { success: "Appearance saved." };
}

/** Disconnects a "Sign in with Jace" app from Account settings' Connected apps list. */
export async function disconnectAppAction(clientId: string): Promise<void> {
  const userId = await requireUserId();
  await revokeGrant(userId, clientId);
  revalidatePath("/profile/[userId]", "page");
}

async function requireRootAdmin(): Promise<void> {
  const session = await auth();
  if (!isRootAdmin(session?.user?.id)) throw new Error("Forbidden");
}

export async function addAdminAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRootAdmin();

  const username = String(formData.get("username") ?? "").trim();
  if (!username) return { error: "Enter a username." };

  const user = await getUserByUsername(username);
  if (!user) return { error: "No account with that username." };
  if (user.isAdmin) return { error: `${user.username} is already an admin.` };

  await setUserAdmin(user.id, true);
  revalidatePath("/profile/[userId]", "page");
  return { success: `${user.username} is now an admin.` };
}

export async function removeAdminAction(userId: string): Promise<void> {
  await requireRootAdmin();
  await setUserAdmin(userId, false);
  revalidatePath("/profile/[userId]", "page");
}

/**
 * Signs in a second (or third, ...) account and remembers it in the account
 * switcher, without signing the currently-active account out first — both
 * end up saved, with the one just entered becoming active. Each account
 * still has to complete a real sign-in (password + 2FA if enabled) here;
 * this doesn't grant access to an account any other way.
 */
export async function addAccountAction(
  _prevState: { error?: string; requiresTotp?: boolean; done?: boolean },
  formData: FormData,
): Promise<{ error?: string; requiresTotp?: boolean; done?: boolean }> {
  // Both read before signing in, since that overwrites the active session
  // (and its cookie) with the new account's.
  const current = await auth();
  const previousToken = (await getActiveSession())?.value ?? null;

  const usernameInput = String(formData.get("username") ?? "");

  try {
    await signIn("credentials", {
      username: usernameInput,
      password: formData.get("password"),
      code: formData.get("code"),
      redirect: false,
    });
  } catch (error) {
    if (error instanceof TotpRequiredError) return { requiresTotp: true };
    if (error instanceof TotpInvalidError) {
      return { requiresTotp: true, error: "Invalid authenticator code." };
    }
    if (error instanceof AuthError) return { error: "Invalid username or password." };
    throw error;
  }

  // The session cookie signIn() just set is an encrypted JWE, so re-resolve
  // who that was the same way auth.ts's authorize() does, rather than
  // re-reading `auth()` (which reflects the request's original cookie
  // header, not what this action just wrote).
  const newUser = usernameInput.includes("@")
    ? (await getUserByEmail(usernameInput)) ?? (await getUserByUsername(usernameInput))
    : (await getUserByUsername(usernameInput)) ?? (await getUserByEmail(usernameInput));
  if (!newUser) return { error: "Signed in, but couldn't find that account." };

  if (current?.user?.id && current.user.name && current.user.id !== newUser.id && previousToken) {
    await upsertAccount(current.user.id, current.user.name, previousToken);
  }
  const newSession = await getActiveSession();
  if (!newSession) return { error: "Signed in, but couldn't read the new session." };
  const result = await upsertAccount(newUser.id, newUser.username, newSession.value);
  if (result.error) return { error: result.error };

  // Note for the caller: `auth()` (and any RSC re-render Next.js folds into
  // this same response) reads the *request's* original Cookie header, which
  // still has the old session — it won't reflect the switch signIn() just
  // made until the browser sends a new request with the Set-Cookie applied.
  // Callers must force a real navigation (not router.refresh()) afterwards.
  await clearAddingAccount();
  revalidatePath("/", "layout");
  return { done: true };
}

/**
 * Called when the Add account popup opens: saves the current account under
 * its own token (only readable now, before another sign-in replaces it) and
 * flags the browser as adding, so sign-ins that finish elsewhere — GitHub,
 * an emailed link, signing up — get saved too (see afterSignInPath).
 */
export async function beginAddAccountAction(): Promise<{ error?: string }> {
  const current = await auth();
  const token = (await getActiveSession())?.value;
  if (!current?.user?.id || !current.user.name || !token) {
    return { error: "You need to be signed in to add another account." };
  }
  const result = await upsertAccount(current.user.id, current.user.name, token);
  if (result.error) return result;
  await markAddingAccount();
  return {};
}

/** The popup was closed without adding anyone. */
export async function cancelAddAccountAction(): Promise<void> {
  await clearAddingAccount();
}

export async function addAccountWithGithubAction(): Promise<void> {
  await signIn("github", { redirectTo: ADD_ACCOUNT_COMPLETE_PATH });
}

export async function switchAccountAction(targetId: string): Promise<void> {
  // Read before activateSavedAccount overwrites the active session cookie.
  const current = await auth();
  const previousToken = (await getActiveSession())?.value ?? null;
  if (
    current?.user?.id &&
    current.user.name &&
    current.user.id !== targetId &&
    previousToken
  ) {
    await upsertAccount(current.user.id, current.user.name, previousToken);
  }

  const switched = await activateSavedAccount(targetId);
  if (!switched) throw new Error("That account is no longer saved.");

  // See the note in addAccountAction: the caller must force a real
  // navigation for the switch to actually take visible effect.
  revalidatePath("/", "layout");
}

export async function removeSavedAccountAction(
  targetId: string,
): Promise<{ removedCurrent: boolean }> {
  const current = await auth();
  await removeSavedAccount(targetId);

  const removedCurrent = current?.user?.id === targetId;
  if (removedCurrent) {
    // Forgetting the account you're currently signed in as also signs you
    // out of it — otherwise you'd still be in its session with no way to
    // switch back to it from the list. The caller navigates to /sign-in
    // afterwards (see the note in addAccountAction on why a real navigation
    // is needed rather than a soft refresh).
    await signOut({ redirect: false });
  }

  revalidatePath("/", "layout");
  return { removedCurrent };
}
