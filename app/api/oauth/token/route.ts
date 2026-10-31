import { NextResponse } from "next/server";
import {
  canUsePkceWithoutSecret,
  codeChallengeOf,
  consumeAuthorizationCode,
  getOAuthClient,
  issueAccessToken,
  verifyCodeVerifier,
  verifyOAuthClientSecret,
} from "@/lib/oauth";

/**
 * The token endpoint for "Sign in with Jace" — a third-party site's *server*
 * calls this (never the browser) to exchange the code from app/oauth/authorize
 * for an access token. Standard OAuth 2.0 authorization_code grant.
 *
 * Accepts client credentials either in the body (`client_id`/`client_secret`,
 * form- or JSON-encoded) or as HTTP Basic auth, since different OAuth client
 * libraries default to one or the other.
 *
 * Apps that can't keep a secret (desktop apps such as Jace OS) use PKCE instead:
 * no client_secret, but a code_verifier matching the code_challenge the code was
 * issued with. A code issued with a challenge always needs its verifier.
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

// Token responses must never be cached (RFC 6749 section 5.1).
const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };

function errorResponse(error: string, description: string, status = 400): NextResponse {
  return NextResponse.json({ error, error_description: description }, { status, headers: NO_STORE });
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

  const codeVerifier = body.code_verifier;
  const challenge = code ? codeChallengeOf(code) : null;

  if (!clientId || !code || !redirectUri || (!clientSecret && !challenge)) {
    return errorResponse(
      "invalid_request",
      "client_id, code and redirect_uri are required, plus client_secret or PKCE (code_verifier).",
    );
  }

  const client = clientSecret
    ? await verifyOAuthClientSecret(clientId, clientSecret)
    : await getOAuthClient(clientId);
  if (!client) {
    return errorResponse("invalid_client", "Unknown client_id/client_secret.", 401);
  }
  // Without a secret, only native apps (localhost redirects only) may sign in, and only with PKCE.
  if (!clientSecret && !canUsePkceWithoutSecret(client)) {
    return errorResponse(
      "invalid_client",
      "This app has a web redirect URI, so it must send its client_secret. Only apps whose redirect URIs are all http://127.0.0.1 or http://localhost can use PKCE alone.",
      401,
    );
  }

  // Consumed before the PKCE check, so a wrong verifier still burns the code.
  const consumed = await consumeAuthorizationCode(code, clientId, redirectUri);
  if (consumed && challenge && !verifyCodeVerifier(challenge, codeVerifier)) {
    return errorResponse("invalid_grant", "The code_verifier doesn't match the code_challenge.");
  }
  if (!consumed) {
    return errorResponse(
      "invalid_grant",
      "That code is invalid, expired, already used, or was issued for a different redirect_uri.",
    );
  }

  const { token, expiresInSeconds } = await issueAccessToken(clientId, consumed.userId, consumed.scope);

  return NextResponse.json(
    {
      access_token: token,
      token_type: "Bearer",
      expires_in: expiresInSeconds,
      scope: consumed.scope,
    },
    { headers: NO_STORE },
  );
}
