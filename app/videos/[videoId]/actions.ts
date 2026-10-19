"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { parseAttachment } from "@/lib/attachments";
import { canManageOwned, canViewVideo, getPostBlockReason } from "@/lib/permissions";
import {
  addVideoComment,
  awaitReadYourWrite,
  deleteVideo,
  deleteVideoComment,
  getOrgById,
  getUserById,
  getVideoById,
  getVideoLikeInfo,
  likeVideo,
  notifyUser,
  pinVideoComment,
  unlikeVideo,
  unpinVideoComment,
  updateVideo,
} from "@/lib/store";
import type { VideoVisibility } from "@/lib/types";

async function assertCanManage(videoId: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const video = await getVideoById(videoId);
  if (!video) throw new Error("Video not found");

  if (!(await canManageOwned(video, session.user.id))) {
    throw new Error("Forbidden");
  }
}

const VISIBILITIES: VideoVisibility[] = ["public", "unlisted", "private"];

export async function updateVideoAction(videoId: string, formData: FormData) {
  await assertCanManage(videoId);

  const title = String(formData.get("title") ?? "").trim().slice(0, 140);
  const description = String(formData.get("description") ?? "")
    .trim()
    .slice(0, 2000);
  const thumbnailUrlRaw = String(formData.get("thumbnailUrl") ?? "").trim();
  const thumbnailUrl = thumbnailUrlRaw
    ? /^https?:\/\//i.test(thumbnailUrlRaw)
      ? thumbnailUrlRaw
      : `https://${thumbnailUrlRaw}`
    : undefined;
  const visibilityRaw = formData.get("visibility");
  const visibility = VISIBILITIES.includes(visibilityRaw as VideoVisibility)
    ? (visibilityRaw as VideoVisibility)
    : "public";

  if (!title) throw new Error("Title is required.");

  await updateVideo(videoId, { title, description, thumbnailUrl, visibility });
  revalidatePath(`/videos/${videoId}`);
  revalidatePath("/videos");
}

export async function deleteVideoAction(videoId: string) {
  await assertCanManage(videoId);
  await deleteVideo(videoId);
  await awaitReadYourWrite(async () => (await getVideoById(videoId)) === null);
  revalidatePath("/videos");
}

export async function addVideoCommentAction(videoId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const blockReason = await getPostBlockReason(session.user.id);
  if (blockReason) throw new Error(blockReason);

  const body = String(formData.get("body") ?? "").trim().slice(0, 2000);
  const attachment = parseAttachment(formData.get("attachment"));
  if (!body && !attachment) throw new Error("Comment can't be empty.");

  const user = await getUserById(session.user.id);
  if (!user) throw new Error("Unauthorized");

  const video = await getVideoById(videoId);
  if (!video) throw new Error("Video not found");
  if (!(await canViewVideo(video, session.user.id))) throw new Error("Video not found");

  await addVideoComment(videoId, {
    id: randomUUID(),
    body,
    authorId: user.id,
    authorName: user.username,
    ...(attachment ? { attachment } : {}),
    createdAt: new Date().toISOString(),
  });

  const recipientIds =
    video.ownerType === "org"
      ? ((await getOrgById(video.ownerId))?.memberIds ?? [])
      : [video.ownerId];
  await Promise.all(
    recipientIds
      .filter((id) => id !== user.id)
      .map((id) =>
        notifyUser(id, {
          type: "video_comment",
          title: `${user.username} commented on ${video.title}`,
          body: body || undefined,
          linkUrl: `/videos/${videoId}`,
        }),
      ),
  );

  revalidatePath(`/videos/${videoId}`);
}

export async function deleteVideoCommentAction(videoId: string, commentId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const video = await getVideoById(videoId);
  if (!video) throw new Error("Video not found");

  const comment = video.comments.find((c) => c.id === commentId);
  if (!comment) return;

  const isAuthor = comment.authorId === session.user.id;
  if (!isAuthor && !(await canManageOwned(video, session.user.id))) {
    throw new Error("Forbidden");
  }

  await deleteVideoComment(videoId, commentId);
  revalidatePath(`/videos/${videoId}`);
}

export async function setVideoCommentPinnedAction(
  videoId: string,
  commentId: string,
  pinned: boolean,
) {
  await assertCanManage(videoId);
  if (pinned) {
    await pinVideoComment(videoId, commentId);
  } else {
    await unpinVideoComment(videoId, commentId);
  }
  revalidatePath(`/videos/${videoId}`);
}

export async function toggleVideoLikeAction(
  videoId: string,
): Promise<{ count: number; likedByMe: boolean }> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const video = await getVideoById(videoId);
  if (!video) throw new Error("Video not found");
  if (!(await canViewVideo(video, session.user.id))) throw new Error("Video not found");

  const current = await getVideoLikeInfo(videoId, session.user.id);
  if (current.likedByMe) {
    await unlikeVideo(videoId, session.user.id);
  } else {
    await likeVideo(videoId, session.user.id);
  }

  revalidatePath(`/videos/${videoId}`);
  revalidatePath("/videos");
  return getVideoLikeInfo(videoId, session.user.id);
}
