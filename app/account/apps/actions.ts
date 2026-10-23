"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  createOAuthApp,
  deleteOAuthApp,
  regenerateOAuthSecret,
  setOAuthWebhookUrl,
} from "@/lib/oauth";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export async function createOAuthAppAction(
  _prevState: { error?: string; secret?: string; clientId?: string },
  formData: FormData,
): Promise<{ error?: string; secret?: string; clientId?: string }> {
  const userId = await requireUserId();
  const name = String(formData.get("name") ?? "");
  const redirectUris = String(formData.get("redirectUris") ?? "")
    .split("\n")
    .map((u) => u.trim())
    .filter(Boolean);

  const result = await createOAuthApp(userId, name, redirectUris);
  if ("error" in result) return { error: result.error };

  revalidatePath("/profile/[userId]", "page");
  return { clientId: result.client.id, secret: result.secret };
}

export async function deleteOAuthAppAction(id: string): Promise<void> {
  const userId = await requireUserId();
  await deleteOAuthApp(id, userId);
  revalidatePath("/profile/[userId]", "page");
}

export async function regenerateOAuthSecretAction(
  id: string,
): Promise<{ error?: string; secret?: string }> {
  const userId = await requireUserId();
  const secret = await regenerateOAuthSecret(id, userId);
  if (!secret) return { error: "Couldn't regenerate that app's secret." };
  return { secret };
}

export async function setOAuthWebhookUrlAction(id: string, url: string): Promise<{ error?: string }> {
  const userId = await requireUserId();
  const result = await setOAuthWebhookUrl(id, userId, url);
  if (!result.error) revalidatePath("/profile/[userId]", "page");
  return result;
}
