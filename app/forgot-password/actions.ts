"use server";

import { getUserByEmail, requestPasswordReset } from "@/lib/store";
import { sendPasswordResetEmail } from "@/lib/email";
import { generateToken, hashToken } from "@/lib/tokens";

export async function requestPasswordResetAction(
  _prevState: { success?: boolean },
  formData: FormData,
): Promise<{ success?: boolean }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (email) {
    const user = await getUserByEmail(email);
    if (user) {
      const token = generateToken();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await requestPasswordReset(user.id, hashToken(token), expiresAt);
      try {
        await sendPasswordResetEmail(email, user.username, token);
      } catch (err) {
        // Same response either way (see below) — but still log so a silent
        // delivery failure doesn't look identical to a successful send.
        console.error("[forgot-password] failed to send reset email:", err);
      }
    }
  }

  // Same response either way — don't reveal whether an account exists.
  return { success: true };
}
