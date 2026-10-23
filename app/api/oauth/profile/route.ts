import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { apiError, authorizeProfile, updateProfileFromApp, userinfoBody } from "@/lib/integration";
import { notifyUserUpdated } from "@/lib/webhooks";

/**
 * Changes the token's user's username and/or picture from an official app
 * (e.g. Jace Social, so a handle or avatar change there shows up on Jace).
 * Body: { "username"?: string, "picture"?: https URL | null }. Returns the
 * same body as app/api/oauth/userinfo.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const caller = await authorizeProfile(request);
  if (caller instanceof NextResponse) return caller;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return apiError("invalid_request", "Send a JSON object body.", 400);
  }
  const result = await updateProfileFromApp(caller, body);
  if ("error" in result) return apiError(result.error, result.description, result.status);
  if (result.changed) {
    const changed = [
      ...(typeof body.username === "string" ? ["username"] : []),
      ...(body.picture !== undefined ? ["picture"] : []),
    ];
    notifyUserUpdated(caller.user.id, changed);
    revalidatePath("/profile/[userId]", "page");
    revalidatePath(`/profile/${caller.user.id}`);
    revalidatePath("/profile");
  }
  return NextResponse.json(userinfoBody(result.user, caller.scope, true));
}
