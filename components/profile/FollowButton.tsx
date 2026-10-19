"use client";

import { useState } from "react";
import { toggleFollowAction } from "@/app/profile/[userId]/actions";

export function FollowButton({
  targetUserId,
  initialFollowing,
}: {
  targetUserId: string;
  initialFollowing: boolean;
}) {
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    const prev = following;
    setFollowing(!prev);
    try {
      const result = await toggleFollowAction(targetUserId);
      setFollowing(result);
    } catch {
      setFollowing(prev);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      className={`h-9 w-fit rounded-full px-4 text-xs font-medium transition-colors disabled:opacity-50 ${
        following
          ? "border border-black/10 hover:bg-black/[.03] dark:border-white/15 dark:hover:bg-white/[.05]"
          : "bg-accent text-on-accent hover:bg-accent-hover"
      }`}
    >
      {following ? "Following" : "Follow"}
    </button>
  );
}
