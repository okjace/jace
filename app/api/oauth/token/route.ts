import { NextResponse } from "next/server";
import { consumeAuthorizationCode, issueAccessToken, verifyOAuthClientSecret } from "@/lib/oauth";

/**
 * The token endpoint for "Sign in with Jace" — a third-party site's *server*
 * calls this (never the browser) to exchange the code from app/oauth/authorize
 * for an access token. Standard OAuth 2.0 authorization_code grant.
 *
 * Accepts client credentials either in the body (`client_id`/`client_secret`,
 * form- or JSON-encoded) or as HTTP Basic auth, since different OAuth client
 * libraries default to one or the other.
 */
function basicAuthCredentials(request: Request): { id: string; secret: string } | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return null;
  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const sep = decoded.indexOf(":");
    if (sep < 0) return null;
    return { id: decoded.slice(0, sep), secret: decoded.slice(sep + 1) };
  } catch {
    return null;
  }
}

function errorResponse(error: string, description: string, status = 400): NextResponse {
  return NextResponse.json({ error, error_description: description }, { status });
}

export async function POST(request: Request): Promise<NextResponse> {
  const contentType = request.headers.get("content-type") ?? "";
  let body: Record<string, string>;
  try {
    if (contentType.includes("application/json")) {
      body = await request.json();
    } else {
      const form = await request.formData();
      body = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
    }
  } catch {
    return errorResponse("invalid_request", "Couldn't parse the request body.");
  }

  if ((body.grant_type ?? "authorization_code") !== "authorization_code") {
    return errorResponse("unsupported_grant_type", "Only authorization_code is supported.");
  }

  const basic = basicAuthCredentials(request);
  const clientId = basic?.id ?? body.client_id;
  const clientSecret = basic?.secret ?? body.client_secret;
  const code = body.code;
  const redirectUri = body.redirect_uri;

  if (!clientId || !clientSecret || !code || !redirectUri) {
    return errorResponse(
      "invalid_request",
      "client_id, client_secret, code, and redirect_uri are all required.",
    );
  }

  const client = await verifyOAuthClientSecret(clientId, clientSecret);
  if (!client) {
    return errorResponse("invalid_client", "Unknown client_id/client_secret.", 401);
  }

  const consumed = await consumeAuthorizationCode(code, clientId, redirectUri);
  if (!consumed) {
    return errorResponse(
      "invalid_grant",
      "That code is invalid, expired, already used, or was issued for a different redirect_uri.",
    );
  }

  const { token, expiresInSeconds } = await issueAccessToken(clientId, consumed.userId, consumed.scope);

  return NextResponse.json({
    access_token: token,
    token_type: "Bearer",
    expires_in: expiresInSeconds,
    scope: consumed.scope,
  });
}
