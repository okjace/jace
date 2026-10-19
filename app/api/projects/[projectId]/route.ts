import { NextResponse } from "next/server";
import { getProjectById } from "@/lib/store";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/projects/[projectId]">,
): Promise<NextResponse> {
  const { projectId } = await ctx.params;
  const project = await getProjectById(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  return NextResponse.json({ project });
}
