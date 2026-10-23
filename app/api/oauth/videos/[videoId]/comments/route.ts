import { NextResponse } from "next/server";
import { addComment, apiError, authorizeVideos, readJsonObject, viewableVideo } from "@/lib/videoApi";

/** Comments { body } on the video as the token's user. Official apps only. */
export async function POST(request: Request, ctx: RouteContext<"/api/oauth/videos/[videoId]/comments">): Promise<NextResponse> {
  const caller = await authorizeVideos(request, { write: "comment" });
  if (caller instanceof NextResponse) return caller;
  const video = await viewableVideo((await ctx.params).videoId, caller);
  if (!video) return apiError("not_found", "No video with that id that you can see.", 404);
  const body = readJsonObject(await request.json().catch(() => null));
  if (!body) return apiError("invalid_request", "Send a JSON object.", 400);
  const result = await addComment(caller.user!, video, body);
  if ("error" in result) return apiError("invalid_request", result.error, 400);
  return NextResponse.json(result, { status: 201 });
}
