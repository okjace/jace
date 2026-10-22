import { NextResponse } from "next/server";
import {
  apiError,
  authorizeAppeals,
  incomingMessages,
  readAppeal,
  replyToAppeal,
} from "@/lib/integration";

/** One person's appeal thread with Jace Official (?since=ISO for only newer messages). */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/oauth/appeals/[userId]">,
): Promise<NextResponse> {
  const caller = await authorizeAppeals(request);
  if (caller instanceof NextResponse) return caller;
  const { userId } = await ctx.params;
  const appeal = await readAppeal(userId, new URL(request.url).searchParams.get("since"));
  if (!appeal) return apiError("not_found", "That account hasn't sent Jace Official any messages.", 404);
  return NextResponse.json(appeal);
}

/** Replies as Jace Official. Same body as the messages API: { body } or { messages: [...] }. */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/oauth/appeals/[userId]">,
): Promise<NextResponse> {
  const caller = await authorizeAppeals(request);
  if (caller instanceof NextResponse) return caller;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return apiError("invalid_request", "Send a JSON object.", 400);
  }
  const inputs = incomingMessages(body);
  if ("error" in inputs) return apiError("invalid_request", inputs.error, 400);
  const { userId } = await ctx.params;
  const result = await replyToAppeal(caller, userId, inputs);
  if ("error" in result) return apiError("invalid_request", result.error, result.status);
  return NextResponse.json(result);
}
