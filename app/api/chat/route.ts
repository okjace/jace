import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { parseAttachment } from "@/lib/attachments";
import { getPostBlockReason, resolveAuthor } from "@/lib/permissions";
import { addChatMessage, getMessageParty, listChatMessages } from "@/lib/store";

export async function GET(): Promise<NextResponse> {
  const messages = await listChatMessages();
  return NextResponse.json({ messages });
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blockReason = await getPostBlockReason(session.user.id);
  if (blockReason) {
    return NextResponse.json({ error: blockReason }, { status: 403 });
  }

  const { body, attachment: rawAttachment, postAsOrgId } = (await request.json()) as {
    body: string;
    attachment?: unknown;
    postAsOrgId?: string;
  };
  const trimmed = (body ?? "").trim();
  const attachment = parseAttachment(rawAttachment);
  if (!trimmed && !attachment) {
    return NextResponse.json({ error: "Message can't be empty" }, { status: 400 });
  }

  const author = await resolveAuthor(session.user.id, session.user.name, postAsOrgId);
  if ("error" in author) return NextResponse.json({ error: author.error }, { status: 403 });

  const message = {
    id: randomUUID(),
    userId: author.authorId,
    userType: author.authorType,
    userName: author.authorName,
    body: trimmed.slice(0, 1000),
    ...(attachment ? { attachment } : {}),
    createdAt: new Date().toISOString(),
  };

  await addChatMessage(message);

  const sender = await getMessageParty(author.authorId);
  return NextResponse.json(
    { message: { ...message, userImageUrl: sender?.imageUrl } },
    { status: 201 },
  );
}
