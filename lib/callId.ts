/** Deterministic Jitsi room names, one per DM/group/public call surface. */

export function dmCallId(userIdA: string, userIdB: string): string {
  return `dm_${[userIdA, userIdB].sort().join("_")}`;
}

export function groupCallId(groupId: string): string {
  return `group_${groupId}`;
}

export const PUBLIC_CALL_ID = "public_lobby";

const JITSI_URL_RE = /^https:\/\/meet\.ffmuc\.net\/jace-[A-Za-z0-9_]+(#.*)?$/;

/** Guards a call-invite message from carrying an arbitrary link instead of an actual Jace call. */
export function isJitsiUrl(value: unknown): value is string {
  return typeof value === "string" && JITSI_URL_RE.test(value);
}
