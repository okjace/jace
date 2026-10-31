"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { parseAttachment } from "@/lib/attachments";
import { getPostBlockReason, isAuthorOrOrgStaff, resolveAuthor } from "@/lib/permissions";
import {
  addReply,
  awaitReadYourWrite,
  deleteReply,
  deleteTopic,
  getForumById,
  getOrgById,
  getTopicById,
  isAdmin,
  notifyUser,
  orgStaffIds,
  updateReply,
  updateTopic,
} from "@/lib/store";
import { checkAutomod, checkImages, hasImage } from "@/lib/automod";

export async function createReplyAction(
  forumId: string,
  topicId: string,
  _prevState: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "You must be signed in to reply." };
  }

  const blockReason = await getPostBlockReason(session.user.id);
  if (blockReason) return { error: blockReason };

  const forum = await getForumById(forumId);
  if (!forum) return { error: "Forum not found." };

  const admin = await isAdmin(session.user.id);
  if (forum.replyPermission === "adminOnly" && !admin) {
    return { error: "Only the site admin can post in this forum." };
  }

  const topic = await getTopicById(topicId);
  if (!topic) return { error: "Topic not found." };

  const body = String(formData.get("body") ?? "").trim();
  const attachment = parseAttachment(formData.get("attachment"));
  if (!body && !attachment) return { error: "Reply can't be empty." };
  const automod =
    (await checkAutomod(session.user.id, "a forum reply", body)) ??
    (await checkImages(session.user.id, "a forum reply", "post", hasImage([body], attachment)));
  if (automod) return { error: automod };

  const author = await resolveAuthor(session.user.id, session.user.name, String(formData.get("postAsOrgId") ?? "") || null);
  if ("error" in author) return { error: author.error };

  await addReply(topicId, {
    id: randomUUID(),
    body: body.slice(0, 20000),
    ...author,
    ...(attachment ? { attachment } : {}),
    createdAt: new Date().toISOString(),
  });

  const topicOrg = topic.authorType === "org" ? await getOrgById(topic.authorId) : null;
  const recipients = topicOrg ? orgStaffIds(topicOrg) : [topic.authorId];
  const senderId = session.user.id;
  await Promise.all(
    recipients
      .filter((id) => id !== senderId && id !== author.authorId)
      .map((id) =>
        notifyUser(id, {
          type: "forum_reply",
          title: `${author.authorName} replied to "${topic.title}"`,
          body: body.slice(0, 140),
          linkUrl: `/forums/${forumId}/${topicId}`,
        }),
      ),
  );

  revalidatePath(`/forums/${forumId}/${topicId}`);
  return {};
}

export async function updateTopicAction(
  forumId: string,
  topicId: string,
  _prevState: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "You must be signed in." };

  const topic = await getTopicById(topicId);
  if (!topic) return { error: "Topic not found." };
  if (!(await isAuthorOrOrgStaff(topic, session.user.id)) && !(await isAdmin(session.user.id))) {
    return { error: "Forbidden." };
  }

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (title.length < 2 || title.length > 140) {
    return { error: "Title must be 2-140 characters." };
  }
  if (!body && !topic.attachment) {
    return { error: "Topic body can't be empty." };
  }
  const automod =
    (await checkAutomod(session.user.id, "a forum topic edit", title, body)) ??
    (await checkImages(session.user.id, "a forum topic edit", "post", hasImage([title, body])));
  if (automod) return { error: automod };

  await updateTopic(topicId, { title, body: body.slice(0, 20000) });
  revalidatePath(`/forums/${forumId}/${topicId}`);
  return {};
}

export async function deleteTopicAction(forumId: string, topicId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const topic = await getTopicById(topicId);
  if (!topic) return;
  if (!(await isAuthorOrOrgStaff(topic, session.user.id)) && !(await isAdmin(session.user.id))) {
    throw new Error("Forbidden");
  }

  await deleteTopic(topicId);
  await awaitReadYourWrite(async () => (await getTopicById(topicId)) === null);
  revalidatePath(`/forums/${forumId}`);
}

export async function updateReplyAction(
  forumId: string,
  topicId: string,
  replyId: string,
  _prevState: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "You must be signed in." };

  const topic = await getTopicById(topicId);
  if (!topic) return { error: "Topic not found." };
  const reply = topic.replies.find((r) => r.id === replyId);
  if (!reply) return { error: "Reply not found." };
  if (!(await isAuthorOrOrgStaff(reply, session.user.id)) && !(await isAdmin(session.user.id))) {
    return { error: "Forbidden." };
  }

  const body = String(formData.get("body") ?? "").trim();
  if (!body && !reply.attachment) return { error: "Reply can't be empty." };
  const automodEdit =
    (await checkAutomod(session.user.id, "a forum reply edit", body)) ??
    (await checkImages(session.user.id, "a forum reply edit", "post", hasImage([body])));
  if (automodEdit) return { error: automodEdit };

  await updateReply(topicId, replyId, body.slice(0, 20000));
  revalidatePath(`/forums/${forumId}/${topicId}`);
  return {};
}

export async function deleteReplyAction(
  forumId: string,
  topicId: string,
  replyId: string,
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const topic = await getTopicById(topicId);
  if (!topic) throw new Error("Topic not found.");

  const reply = topic.replies.find((r) => r.id === replyId);
  if (!reply) return;

  if (!(await isAuthorOrOrgStaff(reply, session.user.id)) && !(await isAdmin(session.user.id))) {
    throw new Error("Forbidden");
  }

  await deleteReply(topicId, replyId);
  revalidatePath(`/forums/${forumId}/${topicId}`);
}
