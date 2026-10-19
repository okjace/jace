import { NextResponse } from "next/server";
import { getAccessTokenSession } from "@/lib/oauth";
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

  const user = await getStoredUserById(session.userId);
  if (!user) {
    return NextResponse.json({ error: "invalid_token", error_description: "Account no longer exists." }, { status: 401 });
  }

  const scopes = session.scope.split(" ");
  const body: Record<string, unknown> = {
    sub: user.id,
    username: user.username,
    name: user.username,
    picture: user.imageUrl ?? null,
    // Lets Jace's apps enforce a Jace ban or mute in their own UI.
    banned: !!user.banned,
    muted: !!user.muted,
  };
  if (scopes.includes("email") && user.email && user.emailVerified) {
    body.email = user.email;
    body.email_verified = true;
  }

  return NextResponse.json(body);
}
