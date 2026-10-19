import { NextResponse, type NextRequest } from "next/server";
import { DOCS_FORUM_ID, NEWS_FORUM_ID, README_FORUM_ID, SUPPORT_ORG_ID } from "@/lib/constants";

/**
 * Jace is now the company site: accounts, projects, and the API the other
 * Jace apps use. The older community features are hidden here rather than
 * deleted — their pages and APIs answer 404, but their database rows and
 * files are untouched, so removing a prefix below brings one back.
 */
const RETIRED_PREFIXES = [
  "/videos",
  "/games",
  "/chat",
  "/dms",
  "/groups",
  "/cloud",
  "/orgs",
  "/api/videos",
  "/api/scores",
  "/api/chat",
  "/api/dms",
  "/api/groups",
  "/api/cloud",
  "/api/orgs",
  "/api/notifications",
  "/api/call-invites",
];

/** Forums are retired too, except the three the site itself publishes in. */
const KEPT_FORUMS = new Set([README_FORUM_ID, NEWS_FORUM_ID, DOCS_FORUM_ID]);

function isRetired(url: URL): boolean {
  const { pathname } = url;
  // Messages with Jace Official stay open: they're how muted and banned
  // accounts appeal, and how staff (acting as the org) answer.
  const dm = pathname.match(/^\/(?:api\/)?dms(?:\/([^/]+))?/);
  if (dm && (dm[1] === SUPPORT_ORG_ID || url.searchParams.get("as") === SUPPORT_ORG_ID)) {
    return false;
  }
  if (RETIRED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;
  const forum = pathname.match(/^\/(?:api\/)?forums(?:\/([^/]+))?/);
  if (forum) return !forum[1] || !KEPT_FORUMS.has(forum[1]);
  return false;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!isRetired(request.nextUrl)) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "This feature has been retired." }, { status: 404 });
  }
  // A path with no page renders the site's 404.
  return NextResponse.rewrite(new URL("/retired-feature", request.url));
}

export const config = {
  matcher: [
    "/(videos|games|chat|dms|groups|cloud|orgs|forums)/:path*",
    "/(videos|games|chat|dms|groups|cloud|orgs|forums)",
    "/api/(videos|scores|chat|dms|groups|cloud|orgs|notifications|call-invites|forums)/:path*",
    "/api/(videos|scores|chat|dms|groups|cloud|orgs|notifications|call-invites|forums)",
  ],
};
