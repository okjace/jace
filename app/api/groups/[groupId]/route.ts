import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isJitsiUrl } from "@/lib/callId";
import { getPostBlockReason } from "@/lib/permissions";
import {
  addGroupChatMessage,
  getGroupChat,
  listGroupChatMessages,
  notifyUser,
} from "@/lib/store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ groupId: string }> },
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { groupId } = await params;
  const group = await getGroupChat(groupId);
  if (!group || !group.memberIds.includes(session.user.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const messages = await listGroupChatMessages(groupId);
  return NextResponse.json({ messages });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> },
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blockReason = await getPostBlockReason(session.user.id);
  if (blockReason) {
    return NextResponse.json({ error: blockReason }, { status: 403 });
  }

  const { groupId } = await params;
  const group = await getGroupChat(groupId);
  if (!group || !group.memberIds.includes(session.user.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { body, kind, callUrl } = (await request.json()) as {
    body: string;
    kind?: unknown;
    callUrl?: unknown;
  };
  const trimmed = (body ?? "").trim();
  const isCallInvite = kind === "call_invite" && isJitsiUrl(callUrl);
  if (!trimmed && !isCallInvite) {
    return NextResponse.json({ error: "Message can't be empty" }, { status: 400 });
  }

  const message = {
    id: randomUUID(),
    groupId,
    fromId: session.user.id,
    fromName: session.user.name ?? "Anonymous",
    body: trimmed.slice(0, 2000),
    ...(isCallInvite ? { kind: "call_invite" as const, callUrl: callUrl as string } : {}),
    createdAt: new Date().toISOString(),
  };

  await addGroupChatMessage(message);

  if (!isCallInvite) {
    const senderId = session.user.id;
    const recipients = group.memberIds.filter((id) => id !== senderId);
    await Promise.all(
      recipients.map((id) =>
        notifyUser(id, {
          type: "message",
          title: `${message.fromName} sent a message in ${group.name}`,
          body: message.body || undefined,
          linkUrl: `/groups/${groupId}`,
        }),
      ),
    );
  }

  return NextResponse.json({ message }, { status: 201 });
}
