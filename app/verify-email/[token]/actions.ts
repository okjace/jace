"use server";

import { confirmEmailChange } from "@/lib/store";
import { hashToken } from "@/lib/tokens";

export async function confirmVerificationAction(
  token: string,
): Promise<{ error?: string; confirmedEmail?: string }> {
  const confirmedEmail = await confirmEmailChange(hashToken(token));
  if (!confirmedEmail) {
    return {
      error:
        "This verification link is invalid or has expired. Request a new one from your account settings.",
    };
  }
  return { confirmedEmail };
}
