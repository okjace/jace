import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canViewVideo } from "@/lib/permissions";
import { getVideoById } from "@/lib/store";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/videos/[videoId]">,
): Promise<NextResponse> {
  const { videoId } = await ctx.params;
  const video = await getVideoById(videoId);
  if (!video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  const session = await auth();
  if (!(await canViewVideo(video, session?.user?.id))) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  return NextResponse.json({ video });
}
