import { NextResponse } from "next/server";
import { queryVideos } from "@/lib/store";
import { apiError, authorizeVideos, createVideo, readJsonObject, videoDetail, videoList } from "@/lib/videoApi";

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 100;

/**
 * Public videos, newest first: everyone's, or one person's with ?user_id=,
 * filtered by ?q=. Page with ?before=<next_before>. Works with a user token
 * or just the app's client credentials (HTTP Basic).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const caller = await authorizeVideos(request, { allowApp: true });
  if (caller instanceof NextResponse) return caller;

  const params = new URL(request.url).searchParams;
  const requested = Number.parseInt(params.get("limit") ?? "", 10);
  const limit = Number.isNaN(requested) ? DEFAULT_LIMIT : Math.min(Math.max(requested, 1), MAX_LIMIT);
  const search = params.get("q")?.trim().slice(0, 100) || undefined;
  const videos = await queryVideos({
    search,
    ownerId: params.get("user_id") || undefined,
    before: params.get("before") || undefined,
    limit,
  });
  return NextResponse.json({
    videos: await videoList(videos),
    next_before: videos.length === limit ? videos[videos.length - 1].createdAt : null,
  });
}

/** Saves a video from a file uploaded through /api/oauth/videos/uploads. Official apps only. */
export async function POST(request: Request): Promise<NextResponse> {
  const caller = await authorizeVideos(request, { write: "upload videos" });
  if (caller instanceof NextResponse) return caller;
  const body = readJsonObject(await request.json().catch(() => null));
  if (!body) return apiError("invalid_request", "Send a JSON object.", 400);

  const result = await createVideo({ ...caller, user: caller.user! }, body);
  if ("error" in result) return apiError("invalid_request", result.error, result.status);
  return NextResponse.json(
    { video: await videoDetail(result.video, caller.user!.id), created: result.created },
    { status: result.created ? 201 : 200 },
  );
}
