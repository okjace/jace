import { NextResponse } from "next/server";
import { auth, signIn } from "@/auth";
import { createBrowserHandoff, jaceBrowserUser } from "@/lib/browserSignIn";
import { apiError } from "@/lib/integration";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Signs Jace Browser in to this website with its Jace account, so you're
 * signed in to Jace without typing anything (see lib/browserSignIn.ts).
 *
 *   POST /api/oauth/browser-session
 *   Authorization: Bearer <Jace Browser access token>
 *   X-Jace-Browser: 1
 *
 * Sets the normal session cookie. If this browser is already signed in to
 * the site (with any account) it's left alone, so switching accounts on the
 * website still works.
 */
export async function POST(request: Request): Promise<NextResponse> {
  // A custom header can't be sent by a cross-site form, and cross-site fetch
  // with one needs CORS, which this route doesn't allow: no login CSRF.
  if (request.headers.get("x-jace-browser") !== "1") {
    return apiError("invalid_request", "Only Jace Browser can use this.", 400);
  }
  const header = request.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : null;
  const browser = await jaceBrowserUser(token);
  if (!browser) return apiError("invalid_token", "That isn't a valid Jace Browser sign-in.", 401);

  const current = await auth();
  if (current?.user?.id) {
    return NextResponse.json(
      { signed_in: true, changed: false, same_account: current.user.id === browser.userId },
      { headers: NO_STORE },
    );
  }

  const code = await createBrowserHandoff(browser.userId);
  await signIn("credentials", { browserHandoff: code, redirect: false });
  return NextResponse.json({ signed_in: true, changed: true, same_account: true }, { headers: NO_STORE });
}
