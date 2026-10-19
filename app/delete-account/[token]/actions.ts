"use server";

import { auth, signOut } from "@/auth";
import {
  awaitReadYourWrite,
  checkAccountDeletionToken,
  deleteUserAccount,
  getUserById,
} from "@/lib/store";
import { hashToken } from "@/lib/tokens";

export async function confirmAccountDeletionAction(
  token: string,
): Promise<{ error?: string; success?: boolean }> {
  const userId = await checkAccountDeletionToken(hashToken(token));
  if (!userId) {
    return { error: "This link is invalid or has expired." };
  }

  await deleteUserAccount(userId);
  await awaitReadYourWrite(async () => (await getUserById(userId)) === null);

  const session = await auth();
  if (session?.user?.id === userId) {
    await signOut({ redirect: false });
  }

  return { success: true };
}
