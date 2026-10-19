"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  addForum,
  awaitReadYourWrite,
  getForumById,
  isAdmin,
  markReadmeSeen,
  pushReadmeToEveryone,
} from "@/lib/store";
import type { ForumPermission } from "@/lib/types";

function parsePermission(value: FormDataEntryValue | null): ForumPermission {
  return value === "adminOnly" ? "adminOnly" : "everyone";
}

export async function createForumAction(
  _prevState: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const session = await auth();
  if (!(await isAdmin(session?.user?.id))) {
    return { error: "Only the site admin can create forums." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (name.length < 2 || name.length > 80) {
    return { error: "Forum name must be 2-80 characters." };
  }
  if (description.length > 2000) {
    return { error: "Description is too long." };
  }

  const id = randomUUID();
  await addForum({
    id,
    name,
    description,
    postPermission: parsePermission(formData.get("postPermission")),
    replyPermission: parsePermission(formData.get("replyPermission")),
    viewPermission: parsePermission(formData.get("viewPermission")),
    createdAt: new Date().toISOString(),
  });

  await awaitReadYourWrite(async () => (await getForumById(id)) !== null);

  redirect(`/forums/${id}`);
}

/** Dismisses the READ ME popup — nothing in it will show again until a newer topic is posted. */
export async function markReadmeSeenAction(): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;
  await markReadmeSeen(session.user.id);
}

/**
 * Re-shows the READ ME popup to every account, with everything currently in
 * that forum — as if each of them were seeing it for the first time. For
 * admins who want to make sure an existing notice gets back in front of
 * people, without needing to post a new topic to trigger it.
 */
export async function pushReadmeToEveryoneAction(): Promise<{ error?: string }> {
  const session = await auth();
  if (!(await isAdmin(session?.user?.id))) {
    return { error: "Only the site admin can do that." };
  }
  await pushReadmeToEveryone();
  revalidatePath("/", "layout");
  return {};
}
