"use server";

import { randomUUID } from "crypto";
import { createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { canViewVideo } from "@/lib/permissions";
import {
  addReport,
  countRecentReportsBy,
  getChatMessageById,
  getForumById,
  getTopicById,
  getUserById,
  getVideoById,
  hasOpenReport,
  isAdmin,
  resolveReport,
} from "@/lib/store";
import type { OwnerType, ReportReason, ReportTargetType } from "@/lib/types";

const REASONS: ReportReason[] = ["spam", "harassment", "inappropriate", "other"];
const TARGETS: ReportTargetType[] = [
  "user",
  "video",
  "video_comment",
  "forum_topic",
  "forum_reply",
  "chat_message",
];
const MAX_REPORTS_PER_HOUR = 10;
const MAX_ANON_REPORTS_PER_HOUR = 5;

/** Anonymous reporters are tracked by a salted hash of their IP so limits and duplicate checks still work without an account. */
async function anonymousReporterId(): Promise<string> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
  const hash = createHash("sha256").update(`${process.env.AUTH_SECRET ?? ""}:${ip}`).digest("hex").slice(0, 24);
  return `anon:${hash}`;
}

type Target = {
  ownerId: string;
  ownerType: OwnerType;
  ownerName: string;
  url: string;
  excerpt: string;
};

/** Looks up what's being reported (only content the reporter can actually see) and snapshots it. */
async function resolveTarget(
  type: ReportTargetType,
  id: string,
  reporterId: string | null,
): Promise<Target | null> {
  const clip = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 300);
  const reporterIsAdmin = reporterId ? await isAdmin(reporterId) : false;

  if (type === "user") {
    const user = await getUserById(id);
    if (!user) return null;
    return {
      ownerId: user.id,
      ownerType: "user",
      ownerName: user.username,
      url: `/profile/${user.id}`,
      excerpt: clip(user.bio || "(no bio)"),
    };
  }
  if (type === "chat_message") {
    const m = await getChatMessageById(id);
    if (!m) return null;
    return {
      ownerId: m.userId,
      ownerType: m.userType ?? "user",
      ownerName: m.userName,
      url: "/chat",
      excerpt: clip(m.body || "(attachment)"),
    };
  }
  if (type === "video" || type === "video_comment") {
    const [videoId, commentId] = id.split(":");
    const video = await getVideoById(videoId);
    if (!video || !(await canViewVideo(video, reporterId))) return null;
    if (type === "video") {
      return {
        ownerId: video.ownerId,
        ownerType: video.ownerType,
        ownerName: video.ownerName,
        url: `/videos/${video.id}`,
        excerpt: clip(`${video.title} — ${video.description}`),
      };
    }
    const c = video.comments.find((x) => x.id === commentId);
    if (!c) return null;
    return {
      ownerId: c.authorId,
      ownerType: "user",
      ownerName: c.authorName,
      url: `/videos/${video.id}`,
      excerpt: clip(c.body || "(attachment)"),
    };
  }
  // forum_topic / forum_reply
  const [topicId, replyId] = id.split(":");
  const topic = await getTopicById(topicId);
  if (!topic) return null;
  const forum = await getForumById(topic.forumId);
  if (!forum || (forum.viewPermission === "adminOnly" && !reporterIsAdmin)) return null;
  const url = `/forums/${topic.forumId}/${topic.id}`;
  if (type === "forum_topic") {
    return {
      ownerId: topic.authorId,
      ownerType: topic.authorType ?? "user",
      ownerName: topic.authorName,
      url,
      excerpt: clip(`${topic.title} — ${topic.body}`),
    };
  }
  const r = topic.replies.find((x) => x.id === replyId);
  if (!r) return null;
  return {
    ownerId: r.authorId,
    ownerType: r.authorType ?? "user",
    ownerName: r.authorName,
    url,
    excerpt: clip(r.body || "(attachment)"),
  };
}

export async function createReportAction(
  targetType: ReportTargetType,
  targetId: string,
  reason: ReportReason,
  details: string,
  honeypot = "",
): Promise<{ error?: string; ok?: boolean }> {
  // Bots tend to fill every field; humans never see this one.
  if (honeypot) return { ok: true };
  const session = await auth();
  if (!TARGETS.includes(targetType) || !REASONS.includes(reason)) {
    return { error: "Invalid report." };
  }
  const cleanDetails = String(details ?? "").trim().slice(0, 500);
  if (reason === "other" && !cleanDetails) {
    return { error: "Please describe the problem." };
  }

  const signedInId = session?.user?.id ?? null;
  const reporterId = signedInId ?? (await anonymousReporterId());
  const target = await resolveTarget(targetType, targetId, signedInId);
  if (!target) return { error: "That content isn't available to report." };
  if (signedInId && target.ownerType === "user" && target.ownerId === signedInId) {
    return { error: "You can't report yourself." };
  }
  if (await hasOpenReport(reporterId, targetType, targetId)) {
    return { error: "You've already reported this — an admin will take a look." };
  }
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  if ((await countRecentReportsBy(reporterId, hourAgo)) >= (signedInId ? MAX_REPORTS_PER_HOUR : MAX_ANON_REPORTS_PER_HOUR)) {
    return { error: "You've sent a lot of reports recently. Please try again later." };
  }

  await addReport({
    id: randomUUID(),
    reporterId,
    reporterName: signedInId ? (session?.user?.name ?? "Anonymous") : "Anonymous",
    targetType,
    targetId,
    ...target,
    reason,
    details: cleanDetails,
    status: "open",
    createdAt: new Date().toISOString(),
  });
  revalidatePath("/admin/reports");
  return { ok: true };
}

export async function resolveReportAction(
  reportId: string,
  status: "resolved" | "dismissed",
  note: string,
): Promise<void> {
  const session = await auth();
  if (!session?.user?.id || !(await isAdmin(session.user.id))) throw new Error("Forbidden");
  await resolveReport(
    reportId,
    status === "resolved" ? "resolved" : "dismissed",
    { id: session.user.id, name: session.user.name ?? "admin" },
    String(note ?? "").trim().slice(0, 500),
  );
  revalidatePath("/admin/reports");
}
