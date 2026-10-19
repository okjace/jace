import { NextResponse } from "next/server";
import { getOrgById } from "@/lib/store";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/orgs/[orgId]">,
): Promise<NextResponse> {
  const { orgId } = await ctx.params;
  const org = await getOrgById(orgId);
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }
  return NextResponse.json({ org });
}
