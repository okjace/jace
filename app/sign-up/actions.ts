"use server";

import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { afterSignInPath } from "@/lib/accountSwitcher";
import { addUser, getUserByUsername } from "@/lib/store";
import { usernameProblem } from "@/lib/automod";

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export async function registerAction(
  _prevState: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!USERNAME_RE.test(username)) {
    return {
      error: "Username must be 3-20 characters: letters, numbers, or underscores.",
    };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const existing = await getUserByUsername(username);
  if (existing) {
    return { error: "That username is taken." };
  }
  const blocked = await usernameProblem(username);
  if (blocked) return { error: blocked.message };

  const passwordHash = await bcrypt.hash(password, 10);
  await addUser({
    id: randomUUID(),
    username,
    passwordHash,
    bio: "",
    createdAt: new Date().toISOString(),
  });

  // The account write above can take a moment to become visible to a fresh
  // read (the JSON store lives behind a CDN), so a sign-in attempted
  // immediately after can spuriously fail to find the user. Retry a couple
  // of times before surfacing an error.
  const delays = [0, 400, 800, 1500, 2500];
  for (let i = 0; i < delays.length; i++) {
    if (delays[i] > 0) {
      await new Promise((resolve) => setTimeout(resolve, delays[i]));
    }
    try {
      await signIn("credentials", {
        username,
        password,
        redirectTo: await afterSignInPath("/"),
      });
      return {};
    } catch (error) {
      if (!(error instanceof AuthError) || i === delays.length - 1) {
        if (error instanceof AuthError) {
          return { error: "Account created, but sign-in failed. Try signing in." };
        }
        throw error;
      }
    }
  }
  return {};
}
