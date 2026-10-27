import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { parseAttachment } from "@/lib/attachments";
import { isJitsiUrl } from "@/lib/callId";
import { SUPPORT_ORG_ID } from "@/lib/constants";
import { getPostBlockReason, resolveDmActor } from "@/lib/permissions";
import {
  addDmMessage,
  dmConversationId,
  getMessageParty,
  getOrgById,
  listDmMessages,
  notifyUser,
  orgStaffIds,
  getModerationStatus,
} from "@/lib/store";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = await resolveDmActor(
    session.user.id,
    session.user.name,
    new URL(request.url).searchParams.get("as"),
  );
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { userId: otherId } = await params;
  const conversationId = dmConversationId(actor.id, otherId);
  const messages = await listDmMessages(conversationId);
  return NextResponse.json({ messages });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = await resolveDmActor(
    session.user.id,
    session.user.name,
    new URL(request.url).searchParams.get("as"),
  );
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { userId: otherId } = await params;

  // Banned and muted users can still message the support org, to appeal —
  // unless the ban or mute was set with appeals turned off.
  if (otherId !== SUPPORT_ORG_ID) {
    const blockReason = await getPostBlockReason(session.user.id);
    if (blockReason) {
      return NextResponse.json({ error: blockReason }, { status: 403 });
    }
  } else if (actor.type === "user") {
    const status = await getModerationStatus(session.user.id);
    if ((status?.banned && !status.banAppealable) || (!status?.banned && status?.muted && !status.muteAppealable)) {
      return NextResponse.json({ error: "Appeals are turned off for your account." }, { status: 403 });
    }
  }

  if (otherId === actor.id) {
    return NextResponse.json(
      { error: "You can't message yourself." },
      { status: 400 },
    );
  }

  const otherUser = await getMessageParty(otherId);
  if (!otherUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { body, attachment: rawAttachment, kind, callUrl } = (await request.json()) as {
    body: string;
    attachment?: unknown;
    kind?: unknown;
    callUrl?: unknown;
  };
  const trimmed = (body ?? "").trim();
  const attachment = parseAttachment(rawAttachment);
  const isCallInvite =
    kind === "call_invite" &&
    isJitsiUrl(callUrl) &&
    actor.type === "user" &&
    otherUser.type === "user";
  if (!trimmed && !attachment && !isCallInvite) {
    return NextResponse.json({ error: "Message can't be empty" }, { status: 400 });
  }

  const message = {
    id: randomUUID(),
    conversationId: dmConversationId(actor.id, otherId),
    fromId: actor.id,
    fromName: actor.name,
    toId: otherId,
    toName: otherUser.name,
    body: trimmed.slice(0, 2000),
    ...(attachment ? { attachment } : {}),
    ...(isCallInvite ? { kind: "call_invite" as const, callUrl: callUrl as string } : {}),
    createdAt: new Date().toISOString(),
  };

  await addDmMessage(message);

  if (!isCallInvite) {
    const senderId = session.user.id;
    const toOrg = otherUser.type === "org" ? await getOrgById(otherId) : null;
    // Messages to an org go to everyone who can act as it; they open the
    // conversation from the org's side.
    const recipients = toOrg ? orgStaffIds(toOrg) : [otherId];
    await Promise.all(
      recipients
        .filter((id) => id !== senderId)
        .map((id) =>
          notifyUser(id, {
            type: "message",
            title: toOrg
              ? `${message.fromName} sent ${toOrg.name} a message`
              : `${message.fromName} sent you a message`,
            body: message.body || (attachment ? "Sent an attachment" : undefined),
            linkUrl: toOrg ? `/dms/${actor.id}?as=${toOrg.id}` : `/dms/${actor.id}`,
          }),
        ),
    );
  }

  return NextResponse.json({ message }, { status: 201 });
}
