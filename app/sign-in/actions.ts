"use server";

import { AuthError } from "next-auth";
import { signIn, TotpInvalidError, TotpRequiredError } from "@/auth";
import { afterSignInPath } from "@/lib/accountSwitcher";
import { safeNextPath } from "@/lib/safeRedirect";

export async function signInAction(
  _prevState: { error?: string; requiresTotp?: boolean },
  formData: FormData,
): Promise<{ error?: string; requiresTotp?: boolean }> {
  try {
    await signIn("credentials", {
      username: formData.get("username"),
      password: formData.get("password"),
      code: formData.get("code"),
      redirectTo: await afterSignInPath(safeNextPath(formData.get("next")) ?? "/"),
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
      return { error: "Invalid username or password." };
    }
    throw error;
  }
}
