import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canActAsOrg } from "@/lib/permissions";
import { deleteDmMessage, getDmMessageById, getOrgById } from "@/lib/store";

/**
 * Deliberately sender-only, unlike chat/forum deletion — a DM is a private
 * conversation between two people, so even the site admin can't delete
 * someone else's side of it.
 */
export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/dms/[userId]/[messageId]">,
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { messageId } = await ctx.params;
  const message = await getDmMessageById(messageId);
  if (!message) {
    return NextResponse.json({ ok: true });
  }

  if (message.fromId !== session.user.id) {
    // Org-sent messages can be deleted by anyone who can act as that org.
    const org = await getOrgById(message.fromId);
    if (!org || !canActAsOrg(org, session.user.id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  await deleteDmMessage(messageId);
  return NextResponse.json({ ok: true });
}
