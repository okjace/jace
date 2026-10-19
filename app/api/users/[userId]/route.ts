import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getModerationStatus, getUserById } from "@/lib/store";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/users/[userId]">,
): Promise<NextResponse> {
  const { userId } = await ctx.params;
  const user = await getUserById(userId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Banned/muted accounts show a label instead of their bio and links (to everyone but themselves).
  const session = await auth();
  const status = session?.user?.id === userId ? null : await getModerationStatus(userId);
  const label = status?.banned ? "THIS IS A BANNED USER" : status?.muted ? "THIS IS A MUTED USER" : null;
  if (label) {
    return NextResponse.json({ user: { ...user, bio: label, website: undefined, socialLinks: [] } });
  }
  return NextResponse.json({ user });
}
