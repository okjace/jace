/**
 * Restricts a caller-supplied "where to go after sign-in" value to a
 * same-site relative path. Used for the `next` param on /sign-in so
 * /oauth/authorize can send someone to sign in and land back where they
 * started — never pass an unvalidated `next` straight into a redirect,
 * or it's an open-redirect vulnerability.
 */
export function safeNextPath(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  if (raw.includes("://")) return null;
  return raw;
}
