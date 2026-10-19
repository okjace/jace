import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAuthorOrOrgStaff } from "@/lib/permissions";
import { deleteChatMessage, getChatMessageById, isAdmin } from "@/lib/store";

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/chat/[messageId]">,
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { messageId } = await ctx.params;
  const message = await getChatMessageById(messageId);
  if (!message) {
    return NextResponse.json({ ok: true });
  }

  if (
    !(await isAuthorOrOrgStaff({ authorId: message.userId, authorType: message.userType }, session.user.id)) &&
    !(await isAdmin(session.user.id))
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await deleteChatMessage(messageId);
  return NextResponse.json({ ok: true });
}
