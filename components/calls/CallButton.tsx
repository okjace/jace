"use client";

/**
 * Opens the call in its own tab rather than embedding it, deliberately:
 * meet.jit.si (the official host) allows embedding but now requires a
 * logged-in moderator to start any new room; meet.ffmuc.net (a long-running
 * community-run public instance) has no such wall but blocks being framed by
 * other sites via CSP. Opening it directly sidesteps both restrictions and
 * gets the real Jitsi UI (mic, camera, screen share, chat) with no login.
 */
export function CallButton({
  roomName,
  currentUserName,
  label = "Join call",
  notify,
}: {
  roomName: string;
  currentUserName: string;
  label?: string;
  /** When set, clicking also posts a "started a call" message so the other
   * side gets it in their chat history and the site-wide incoming-call popup. */
  notify?: { type: "dm"; otherId: string } | { type: "group"; groupId: string };
}) {
  const url = `https://meet.ffmuc.net/jace-${roomName}#userInfo.displayName=%22${encodeURIComponent(currentUserName)}%22`;

  function announceCall() {
    if (!notify) return;
    const endpoint =
      notify.type === "dm" ? `/api/dms/${notify.otherId}` : `/api/groups/${notify.groupId}`;
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body: `📞 ${currentUserName} started a call`,
        kind: "call_invite",
        callUrl: url,
      }),
    }).catch(() => {});
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={announceCall}
      className="flex h-9 w-fit items-center gap-1.5 rounded-full border border-line px-4 text-xs font-medium transition-colors hover:bg-foreground/[.05]"
    >
      🎙️ {label}
    </a>
  );
}
