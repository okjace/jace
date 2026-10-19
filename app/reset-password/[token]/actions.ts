"use server";

import bcrypt from "bcryptjs";
import { consumePasswordReset } from "@/lib/store";
import { hashToken } from "@/lib/tokens";

export async function resetPasswordAction(
  token: string,
  _prevState: { error?: string; success?: boolean },
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const ok = await consumePasswordReset(hashToken(token), passwordHash);
  if (!ok) {
    return { error: "This link is invalid or has expired. Request a new one." };
  }
  return { success: true };
}
