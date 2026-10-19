import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listPendingCallInvites } from "@/lib/store";

export async function GET(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const since = new URL(request.url).searchParams.get("since");
  if (!since) {
    return NextResponse.json({ error: "Missing since" }, { status: 400 });
  }

  const invites = await listPendingCallInvites(session.user.id, since);
  return NextResponse.json({ invites });
}
