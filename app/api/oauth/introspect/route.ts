import { NextResponse } from "next/server";
import { getAccessTokenRecord, verifyOAuthClientSecret } from "@/lib/oauth";
import { getStoredUserById } from "@/lib/store";

/**
 * Token introspection (RFC 7662) for server-side apps (Jace Social, Jace Store):
 * check that an access token a desktop app handed over was really issued to
 * *your* app, for whom, with which scope, and until when.
 *
 * POST (form or JSON) token=<access token>, authenticated with your
 * client_id/client_secret (HTTP Basic, or in the body).
 * → { active: true, client_id, sub, scope, exp } for your own valid tokens,
 *   otherwise just { active: false } — including tokens issued to other apps,
 *   expired ones, and tokens of banned accounts, so nothing leaks.
 */
const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };

function inactive(): NextResponse {
  return NextResponse.json({ active: false }, { headers: NO_STORE });
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
    return NextResponse.json({ error: "invalid_request", error_description: "Couldn't parse the request body." }, { status: 400, headers: NO_STORE });
  }

  let clientId = body.client_id;
  let clientSecret = body.client_secret;
  const header = request.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const sep = decoded.indexOf(":");
    if (sep > 0) {
      clientId = decoded.slice(0, sep);
      clientSecret = decoded.slice(sep + 1);
    }
  }
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "invalid_client", error_description: "Authenticate with your client_id and client_secret." },
      { status: 401, headers: { ...NO_STORE, "WWW-Authenticate": 'Basic realm="Jace"' } },
    );
  }
  const client = await verifyOAuthClientSecret(clientId, clientSecret);
  if (!client) {
    return NextResponse.json(
      { error: "invalid_client", error_description: "Unknown client_id/client_secret." },
      { status: 401, headers: { ...NO_STORE, "WWW-Authenticate": 'Basic realm="Jace"' } },
    );
  }
  if (!body.token) {
    return NextResponse.json({ error: "invalid_request", error_description: "token is required." }, { status: 400, headers: NO_STORE });
  }

  // token_type_hint is optional and only access tokens exist, so it's ignored.
  const record = await getAccessTokenRecord(body.token);
  if (!record || record.clientId !== client.id) return inactive();
  const user = await getStoredUserById(record.userId);
  if (!user || user.banned) return inactive();

  return NextResponse.json(
    {
      active: true,
      client_id: record.clientId,
      sub: record.userId,
      scope: record.scope,
      exp: Math.floor(Date.parse(record.expiresAt) / 1000),
    },
    { headers: NO_STORE },
  );
}
