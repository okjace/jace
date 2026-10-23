import { NextResponse } from "next/server";
import { canManageOwned } from "@/lib/permissions";
import { deleteVideo, getVideoById, updateVideo, type VideoPatch } from "@/lib/store";
import {
  MAX_DESCRIPTION,
  MAX_TITLE,
  VISIBILITIES,
  apiError,
  authorizeVideos,
  readJsonObject,
  videoDetail,
  viewableVideo,
} from "@/lib/videoApi";
import { getPublicUrl } from "@/lib/storage";
import type { VideoVisibility } from "@/lib/types";

const notFound = () => apiError("not_found", "No video with that id that you can see.", 404);

/** One video with its comments. Unlisted videos work for anyone with the id; private ones only for their owner. */
export async function GET(request: Request, ctx: RouteContext<"/api/oauth/videos/[videoId]">): Promise<NextResponse> {
  const caller = await authorizeVideos(request, { allowApp: true });
  if (caller instanceof NextResponse) return caller;
  const video = await viewableVideo((await ctx.params).videoId, caller);
  if (!video) return notFound();
  return NextResponse.json({ video: await videoDetail(video, caller.user?.id ?? null) });
}

/** Edits { title?, description?, visibility?, thumbnail_path? }. The owner (or a Jace admin), official apps only. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/oauth/videos/[videoId]">): Promise<NextResponse> {
  const caller = await authorizeVideos(request, { write: "edit videos" });
  if (caller instanceof NextResponse) return caller;
  const user = caller.user!;
  const video = await getVideoById((await ctx.params).videoId);
  if (!video || !(await canManageOwned(video, user.id))) return notFound();
  const body = readJsonObject(await request.json().catch(() => null));
  if (!body) return apiError("invalid_request", "Send a JSON object.", 400);

  const patch: VideoPatch = {};
  if (body.title !== undefined) {
    const title = typeof body.title === "string" ? body.title.trim().slice(0, MAX_TITLE) : "";
    if (!title) return apiError("invalid_request", "title can't be empty.", 400);
    patch.title = title;
  }
  if (body.description !== undefined) {
    if (typeof body.description !== "string") return apiError("invalid_request", "description must be a string.", 400);
    patch.description = body.description.trim().slice(0, MAX_DESCRIPTION);
  }
  if (body.visibility !== undefined) {
    if (!VISIBILITIES.includes(body.visibility as VideoVisibility)) {
      return apiError("invalid_request", 'visibility must be "public", "unlisted", or "private".', 400);
    }
    patch.visibility = body.visibility as VideoVisibility;
  }
  if (body.thumbnail_path !== undefined) {
    const path = body.thumbnail_path;
    if (typeof path !== "string" || !path.startsWith(`thumbnails/${user.id}/`) || path.includes("..")) {
      return apiError("invalid_request", "thumbnail_path must be one returned by the uploads endpoint.", 400);
    }
    patch.thumbnailUrl = getPublicUrl(path);
  }
  await updateVideo(video.id, patch);
  const updated = (await getVideoById(video.id)) ?? video;
  return NextResponse.json({ video: await videoDetail(updated, user.id) });
}

/** Deletes the video and its files. The owner (or a Jace admin), official apps only. */
export async function DELETE(request: Request, ctx: RouteContext<"/api/oauth/videos/[videoId]">): Promise<NextResponse> {
  const caller = await authorizeVideos(request, { write: "delete videos" });
  if (caller instanceof NextResponse) return caller;
  const video = await getVideoById((await ctx.params).videoId);
  if (!video || !(await canManageOwned(video, caller.user!.id))) return notFound();
  await deleteVideo(video.id);
  return NextResponse.json({ deleted: true });
}
