import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUnseenReadmeTopicIds } from "@/lib/store";

/** Polled by `ReadmeWatcher` so the popup shows up mid-session too, not just on a fresh page load. */
export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ids = await getUnseenReadmeTopicIds(session.user.id);
  return NextResponse.json({ ids });
}
