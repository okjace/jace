import { NextResponse } from "next/server";
import { userinfoBody } from "@/lib/integration";
import { getAccessTokenSession, getOAuthClient, isOfficialClient } from "@/lib/oauth";
import { getStoredUserById } from "@/lib/store";

/**
 * The userinfo endpoint for "Sign in with Jace" — the third-party site's
 * server calls this with the access token from app/api/oauth/token to learn
 * who signed in. Claim names (`sub`, `picture`, `email_verified`) follow the
 * usual OpenID Connect convention so generic OAuth/OIDC client libraries can
 * map them without custom code, even though this isn't full OIDC.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const auth = request.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "invalid_request", error_description: "Missing bearer token." }, { status: 401 });
  }

  const session = await getAccessTokenSession(token);
  if (!session) {
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }

  const [user, client] = await Promise.all([
    getStoredUserById(session.userId),
    getOAuthClient(session.clientId),
  ]);
  if (!user) {
    return NextResponse.json({ error: "invalid_token", error_description: "Account no longer exists." }, { status: 401 });
  }

  return NextResponse.json(userinfoBody(user, session.scope, !!client && isOfficialClient(client)));
}
