import { NextResponse } from "next/server";
import { queryVideos } from "@/lib/store";
import { apiError, authorizeVideos, videoList } from "@/lib/videoApi";

const MAX_LIMIT = 100;

/**
 * Every video the token's user owns — public, unlisted, and private,
 * including the ones uploaded on the old Jace site — newest first.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const caller = await authorizeVideos(request);
  if (caller instanceof NextResponse) return caller;
  if (!caller.user) return apiError("invalid_token", "Missing bearer token.", 401);

  const params = new URL(request.url).searchParams;
  const requested = Number.parseInt(params.get("limit") ?? "", 10);
  const limit = Number.isNaN(requested) ? MAX_LIMIT : Math.min(Math.max(requested, 1), MAX_LIMIT);
  const videos = await queryVideos({
    ownerId: caller.user.id,
    before: params.get("before") || undefined,
    limit,
    includeHidden: true,
  });
  return NextResponse.json({
    videos: await videoList(videos),
    next_before: videos.length === limit ? videos[videos.length - 1].createdAt : null,
  });
}
