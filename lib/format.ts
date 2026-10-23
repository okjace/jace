export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / Math.pow(1024, i);
  return `${i === 0 ? value : value.toFixed(1)} ${units[i]}`;
}

/** What to call someone: their display name if they set one, otherwise their username. */
export function displayNameOf(user: { username: string; displayName?: string | null }): string {
  return user.displayName || user.username;
}

export const MAX_DISPLAY_NAME_LENGTH = 32;

/**
 * Cleans a display name: drops control and invisible formatting characters
 * (so it can't be blank-looking or reorder text), collapses whitespace, and
 * trims. Returns null when nothing is left (= use the username).
 */
export function cleanDisplayName(raw: string): string | null {
  const cleaned = raw
    .normalize("NFC")
    // Keep the zero-width joiner, which combined emoji (family, profession) are built with.
    .replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, (c) => (c === "\u200d" ? c : ""))
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
}
