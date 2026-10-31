import { NextResponse } from "next/server";
import { getAutomodSettings } from "@/lib/automod";
import { authorizeOfficialClient } from "@/lib/integration";

/**
 * Jace's auto moderation rules, for Jace's own apps (Jace Social) to apply the same ones, with
 * the app's client_id/client_secret (HTTP Basic). Read only: admins change them on Jace
 * (Manage account → Moderation, lib/automod.ts).
 *
 * GET -> { enabled, blocked_terms, blocked_usernames, block_post_images, block_profile_images,
 *          max_links, auto_mute_after, auto_mute_minutes }
 */
export async function GET(request: Request): Promise<NextResponse> {
  const client = await authorizeOfficialClient(request, {});
  if (client instanceof NextResponse) return client;
  const s = await getAutomodSettings();
  return NextResponse.json({
    enabled: s.enabled,
    blocked_terms: s.blockedTerms,
    blocked_usernames: s.blockedUsernames,
    block_post_images: s.blockPostImages,
    block_profile_images: s.blockProfileImages,
    max_links: s.maxLinks,
    auto_mute_after: s.autoMuteAfter,
    auto_mute_minutes: s.autoMuteMinutes,
  }, { headers: { "Cache-Control": "no-store" } });
}
