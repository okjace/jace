import { NextResponse } from "next/server";
import {
  apiError,
  authorizeOfficialClient,
  findTarget,
  moderate,
  moderationStatus,
} from "@/lib/integration";

/**
 * Server-to-server moderation for Jace's own apps, authenticated with the
 * app's client_id/client_secret (HTTP Basic or JSON body).
 *
 * POST { action: "ban" | "unban" | "status", user_id | username, reason? }
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return apiError("invalid_request", "Send a JSON body.", 400);

  const client = await authorizeOfficialClient(request, body);
  if (client instanceof NextResponse) return client;

  const action = body.action;
  if (action !== "ban" && action !== "unban" && action !== "status") {
    return apiError("invalid_request", 'action must be "ban", "unban", or "status".', 400);
  }
  const target = await findTarget(body);
  if (!target) return apiError("not_found", "No Jace account matches that user_id or username.", 404);

  if (action !== "status") {
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 400) : "";
    const failure = await moderate(client, action, target, reason);
    if (failure) return apiError("forbidden", failure.error, failure.status);
  }
  const updated = await findTarget({ user_id: target.id });
  return NextResponse.json(moderationStatus(updated ?? target));
}
