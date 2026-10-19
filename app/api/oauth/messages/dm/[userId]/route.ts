import { NextResponse } from "next/server";
import {
  apiError,
  authorizeMessages,
  incomingMessages,
  readDirectMessages,
  writeDirectMessages,
} from "@/lib/integration";

/** The conversation between the token's user and :userId, oldest first (?since=ISO for only newer ones). */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/oauth/messages/dm/[userId]">,
): Promise<NextResponse> {
  const caller = await authorizeMessages(request);
  if (caller instanceof NextResponse) return caller;
  const { userId } = await ctx.params;
  const sinceIso = new URL(request.url).searchParams.get("since");
  return NextResponse.json({ messages: await readDirectMessages(caller.user, userId, sinceIso) });
}

/** Sends (or imports, with created_at/external_id) messages from the token's user to :userId. */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/oauth/messages/dm/[userId]">,
): Promise<NextResponse> {
  const caller = await authorizeMessages(request);
  if (caller instanceof NextResponse) return caller;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return apiError("invalid_request", "Send a JSON body.", 400);
  const inputs = incomingMessages(body);
  if ("error" in inputs) return apiError("invalid_request", inputs.error, 400);
  const { userId } = await ctx.params;
  const result = await writeDirectMessages(caller, userId, inputs);
  if ("error" in result) return apiError("invalid_request", result.error, result.status);
  return NextResponse.json(result);
}
