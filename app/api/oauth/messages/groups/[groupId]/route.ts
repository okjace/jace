import { NextResponse } from "next/server";
import {
  apiError,
  authorizeMessages,
  incomingMessages,
  readGroupMessages,
  writeGroupMessages,
} from "@/lib/integration";

/** A group chat the token's user is in, oldest first (?since=ISO for only newer ones). */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/oauth/messages/groups/[groupId]">,
): Promise<NextResponse> {
  const caller = await authorizeMessages(request);
  if (caller instanceof NextResponse) return caller;
  const { groupId } = await ctx.params;
  const sinceIso = new URL(request.url).searchParams.get("since");
  const messages = await readGroupMessages(caller.user, groupId, sinceIso);
  if (!messages) return apiError("not_found", "No group chat with that id that this account is in.", 404);
  return NextResponse.json({ messages });
}

/** Sends (or imports, with created_at/external_id) messages from the token's user to the group. */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/oauth/messages/groups/[groupId]">,
): Promise<NextResponse> {
  const caller = await authorizeMessages(request);
  if (caller instanceof NextResponse) return caller;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return apiError("invalid_request", "Send a JSON body.", 400);
  const inputs = incomingMessages(body);
  if ("error" in inputs) return apiError("invalid_request", inputs.error, 400);
  const { groupId } = await ctx.params;
  const result = await writeGroupMessages(caller, groupId, inputs);
  if ("error" in result) return apiError("invalid_request", result.error, result.status);
  return NextResponse.json(result);
}
