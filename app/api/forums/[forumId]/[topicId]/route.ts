import { NextResponse } from "next/server";
import { getTopicById } from "@/lib/store";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/forums/[forumId]/[topicId]">,
): Promise<NextResponse> {
  const { topicId } = await ctx.params;
  const topic = await getTopicById(topicId);
  if (!topic) {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  }
  return NextResponse.json({ topic });
}
