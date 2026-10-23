import { NextResponse } from "next/server";
import { getVideoLikeInfo, likeVideo, unlikeVideo } from "@/lib/store";
import { apiError, authorizeVideos, viewableVideo } from "@/lib/videoApi";

async function toggle(request: Request, ctx: RouteContext<"/api/oauth/videos/[videoId]/likes">, like: boolean) {
  const caller = await authorizeVideos(request, { write: "like videos" });
  if (caller instanceof NextResponse) return caller;
  const video = await viewableVideo((await ctx.params).videoId, caller);
  if (!video) return apiError("not_found", "No video with that id that you can see.", 404);
  if (like) await likeVideo(video.id, caller.user!.id);
  else await unlikeVideo(video.id, caller.user!.id);
  const info = await getVideoLikeInfo(video.id, caller.user!.id);
  return NextResponse.json({ likes: info.count, liked_by_me: info.likedByMe });
}

/** Likes the video as the token's user. Official apps only. */
export function POST(request: Request, ctx: RouteContext<"/api/oauth/videos/[videoId]/likes">) {
  return toggle(request, ctx, true);
}

/** Removes the token user's like. */
export function DELETE(request: Request, ctx: RouteContext<"/api/oauth/videos/[videoId]/likes">) {
  return toggle(request, ctx, false);
}
