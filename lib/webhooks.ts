import "server-only";
import { after } from "next/server";
import { ROOT_ADMIN_ID } from "./constants";
import { sql } from "./db";

/**
 * Tells Jace's official apps (oauth_clients.webhook_url, owner = site owner)
 * that one of their users changed their Jace profile, so e.g. Jace Social can
 * update the profile picture. The ping only says who changed; apps re-read
 * the profile from Jace (userinfo, or the public /api/users/{id}), so it
 * needs no signature and a forged ping can't change anything.
 */
export function notifyUserUpdated(userId: string, changed: string[]): void {
  after(async () => {
    const rows = await sql`
      SELECT DISTINCT c.webhook_url FROM oauth_clients c
      JOIN oauth_grants g ON g.client_id = c.id AND g.user_id = ${userId}
      WHERE c.owner_id = ${ROOT_ADMIN_ID} AND c.webhook_url IS NOT NULL
    `;
    const body = JSON.stringify({ type: "user.updated", user_id: userId, changed, sent_at: new Date().toISOString() });
    await Promise.allSettled(
      rows.map((r) =>
        fetch(r.webhook_url as string, {
          method: "POST",
          headers: { "Content-Type": "application/json", "User-Agent": "Jace-Webhooks" },
          body,
          signal: AbortSignal.timeout(5_000),
        }),
      ),
    );
  });
}
