import { NextResponse } from "next/server";
import { getStoredUserById } from "@/lib/store";
import {
  canUsePkceWithoutSecret,
  codeChallengeOf,
  getAccessTokenRecord,
  intersectScopes,
  isOfficialClient,
  isTokenExchanger,
  normalizeScope,
  recordGrant,
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

const TOKEN_EXCHANGE_GRANT = "urn:ietf:params:oauth:grant-type:token-exchange";
const ACCESS_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:access_token";

/**
 * Token exchange (RFC 8693): Jace OS trades its own access token for one to
 * another official Jace app, for the same person, so signing in to the desktop
 * signs you in to Jace's apps without asking again (Jace OS's consent screen
 * says it can). Rules:
 * - only apps in TOKEN_EXCHANGER_IDS may exchange (lib/oauth.ts);
 * - subject_token must be a valid, unexpired access token issued to that app,
 *   for an account that isn't banned;
 * - audience must be a different, official app;
 * - scope = requested ∩ what the audience may have ∩ the subject token's scope;
 * - the new token never outlives the subject token, and the grant is recorded
 *   so it shows (and can be disconnected) under Connected apps.
 */
async function tokenExchange(
  body: Record<string, string>,
  basic: { id: string; secret: string } | null,
): Promise<NextResponse> {
  const clientId = basic?.id ?? body.client_id;
  const clientSecret = basic?.secret ?? body.client_secret;
  if (!clientId) return errorResponse("invalid_request", "client_id is required.");
  if (!body.subject_token) return errorResponse("invalid_request", "subject_token is required.");
  if ((body.subject_token_type ?? "") !== ACCESS_TOKEN_TYPE) {
    return errorResponse("invalid_request", `subject_token_type must be ${ACCESS_TOKEN_TYPE}.`);
  }
  if (body.requested_token_type && body.requested_token_type !== ACCESS_TOKEN_TYPE) {
    return errorResponse("invalid_request", `Only ${ACCESS_TOKEN_TYPE} can be requested.`);
  }
  if (!body.audience) return errorResponse("invalid_request", "audience (the client_id of the app to sign in to) is required.");

  const exchanger = clientSecret
    ? await verifyOAuthClientSecret(clientId, clientSecret)
    : await getOAuthClient(clientId);
  if (!exchanger) return errorResponse("invalid_client", "Unknown client_id/client_secret.", 401);
  if (!clientSecret && !canUsePkceWithoutSecret(exchanger)) {
    return errorResponse("invalid_client", "This app has a web redirect URI, so it must send its client_secret.", 401);
  }
  if (!isTokenExchanger(exchanger.id)) {
    return errorResponse("unauthorized_client", "This app isn't allowed to exchange tokens.", 403);
  }

  const subject = await getAccessTokenRecord(body.subject_token);
  if (!subject || subject.clientId !== exchanger.id) {
    return errorResponse("invalid_grant", "subject_token is invalid, expired, or wasn't issued to this app.");
  }
  const user = await getStoredUserById(subject.userId);
  if (!user) return errorResponse("invalid_grant", "That account no longer exists.");
  if (user.banned) return errorResponse("invalid_grant", "That Jace account is banned.");

  const audience = await getOAuthClient(body.audience);
  if (!audience || audience.id === exchanger.id || !isOfficialClient(audience)) {
    return errorResponse("invalid_target", "audience must be the client_id of one of Jace's own (official) apps.");
  }

  const requested = body.scope ?? subject.scope;
  const scope = intersectScopes(normalizeScope(requested, audience), subject.scope, requested.includes("profile") ? requested : `${requested} profile`);
  if (!scope.split(" ").includes("profile")) {
    return errorResponse("invalid_scope", "The token being exchanged doesn't allow signing in (profile).");
  }

  const { token, expiresInSeconds } = await issueAccessToken(audience.id, user.id, scope, subject.expiresAt);
  await recordGrant(user.id, audience.id, scope);
  return NextResponse.json(
    {
      access_token: token,
      issued_token_type: ACCESS_TOKEN_TYPE,
      token_type: "Bearer",
      expires_in: expiresInSeconds,
      scope,
    },
    { headers: NO_STORE },
  );
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

  const grantType = body.grant_type ?? "authorization_code";
  if (grantType === TOKEN_EXCHANGE_GRANT) return tokenExchange(body, basicAuthCredentials(request));
  if (grantType !== "authorization_code") {
    return errorResponse("unsupported_grant_type", `grant_type must be authorization_code or ${TOKEN_EXCHANGE_GRANT}.`);
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
