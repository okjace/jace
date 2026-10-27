"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { parseAttachment } from "@/lib/attachments";
import { getPostBlockReason, resolveAuthor } from "@/lib/permissions";
import {
  addTopic,
  awaitReadYourWrite,
  deleteForum,
  getForumById,
  getTopicById,
  isAdmin,
  updateForum,
} from "@/lib/store";
import type { ForumPermission } from "@/lib/types";
import { checkAutomod } from "@/lib/automod";

function parsePermission(value: FormDataEntryValue | null): ForumPermission {
  return value === "adminOnly" ? "adminOnly" : "everyone";
}

export async function updateForumPermissionsAction(
  forumId: string,
  formData: FormData,
) {
  const session = await auth();
  if (!(await isAdmin(session?.user?.id))) throw new Error("Forbidden");

  await updateForum(forumId, {
    postPermission: parsePermission(formData.get("postPermission")),
    replyPermission: parsePermission(formData.get("replyPermission")),
    viewPermission: parsePermission(formData.get("viewPermission")),
  });
  revalidatePath(`/forums/${forumId}`);
  revalidatePath("/forums");
}

export async function deleteForumAction(forumId: string) {
  const session = await auth();
  if (!(await isAdmin(session?.user?.id))) throw new Error("Forbidden");

  await deleteForum(forumId);
  await awaitReadYourWrite(async () => (await getForumById(forumId)) === null);
  revalidatePath("/forums");
}

export async function createTopicAction(
  forumId: string,
  _prevState: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "You must be signed in to post." };
  }

  const blockReason = await getPostBlockReason(session.user.id);
  if (blockReason) return { error: blockReason };

  const forum = await getForumById(forumId);
  if (!forum) return { error: "Forum not found." };

  const admin = await isAdmin(session.user.id);
  if (forum.postPermission === "adminOnly" && !admin) {
    return { error: "Only the site admin can post in this forum." };
  }
  if (forum.viewPermission === "adminOnly" && !admin) {
    return { error: "Forum not found." };
  }

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const attachment = parseAttachment(formData.get("attachment"));

  if (title.length < 2 || title.length > 140) {
    return { error: "Title must be 2-140 characters." };
  }
  if (!body && !attachment) {
    return { error: "Topic body can't be empty." };
  }
  const automod = await checkAutomod(session.user.id, "a forum topic", title, body);
  if (automod) return { error: automod };

  const author = await resolveAuthor(session.user.id, session.user.name, String(formData.get("postAsOrgId") ?? "") || null);
  if ("error" in author) return { error: author.error };

  const id = randomUUID();
  await addTopic({
    id,
    forumId,
    title,
    body: body.slice(0, 20000),
    ...author,
    replies: [],
    ...(attachment ? { attachment } : {}),
    createdAt: new Date().toISOString(),
  });

  await awaitReadYourWrite(async () => (await getTopicById(id)) !== null);

  redirect(`/forums/${forumId}/${id}`);
}
