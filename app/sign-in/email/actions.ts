"use server";

import { AuthError } from "next-auth";
import { signIn, TotpInvalidError, TotpRequiredError } from "@/auth";
import { afterSignInPath } from "@/lib/accountSwitcher";
import { getUserByEmail, requestEmailSignIn } from "@/lib/store";
import { sendSignInEmail } from "@/lib/email";
import { generateToken, hashToken } from "@/lib/tokens";

export async function requestEmailSignInAction(
  _prevState: { success?: boolean },
  formData: FormData,
): Promise<{ success?: boolean }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (email) {
    const user = await getUserByEmail(email);
    if (user) {
      const token = generateToken();
      const expiresAt = new Date(Date.now() + 20 * 60 * 1000).toISOString();
      await requestEmailSignIn(user.id, hashToken(token), expiresAt);
      try {
        await sendSignInEmail(email, user.username, token);
      } catch (err) {
        // Same response either way (see below) — but still log so a silent
        // delivery failure doesn't look identical to a successful send.
        console.error("[sign-in/email] failed to send sign-in email:", err);
      }
    }
  }

  // Same response either way — don't reveal whether an account exists.
  return { success: true };
}

export async function confirmEmailSignInAction(
  token: string,
  _prevState: { error?: string; requiresTotp?: boolean },
  formData: FormData,
): Promise<{ error?: string; requiresTotp?: boolean }> {
  try {
    await signIn("credentials", {
      magicToken: token,
      code: formData.get("code"),
      redirectTo: await afterSignInPath("/"),
    });
    return {};
  } catch (error) {
    if (error instanceof TotpRequiredError) {
      return { requiresTotp: true };
    }
    if (error instanceof TotpInvalidError) {
      return { requiresTotp: true, error: "Invalid authenticator code." };
    }
    if (error instanceof AuthError) {
      return { error: "This link is invalid or has expired." };
    }
    throw error;
  }
}
