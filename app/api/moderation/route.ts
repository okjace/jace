import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getStoredUserById } from "@/lib/store";

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getStoredUserById(session.user.id);
  return NextResponse.json({ banned: !!user?.banned, muted: !!user?.muted });
}
