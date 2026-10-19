import { NextResponse } from "next/server";
import { authorizeMessages, listConversationsFor } from "@/lib/integration";

/** Every direct-message conversation and group chat the token's user is in. */
export async function GET(request: Request): Promise<NextResponse> {
  const caller = await authorizeMessages(request);
  if (caller instanceof NextResponse) return caller;
  return NextResponse.json(await listConversationsFor(caller.user));
}
