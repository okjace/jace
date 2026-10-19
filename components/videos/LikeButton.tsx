"use client";

import { useState } from "react";
import Link from "next/link";
import { toggleVideoLikeAction } from "@/app/videos/[videoId]/actions";

export function LikeButton({
  videoId,
  initialCount,
  initialLiked,
  signedIn,
}: {
  videoId: string;
  initialCount: number;
  initialLiked: boolean;
  signedIn: boolean;
}) {
  const [count, setCount] = useState(initialCount);
  const [liked, setLiked] = useState(initialLiked);
  const [busy, setBusy] = useState(false);

  if (!signedIn) {
    return (
      <Link
        href="/sign-in"
        className="flex h-9 w-fit items-center gap-1.5 rounded-full border border-black/10 px-4 text-xs font-medium transition-colors hover:bg-black/[.03] dark:border-white/15 dark:hover:bg-white/[.05]"
      >
        ♥ {count}
      </Link>
    );
  }

  async function handleClick() {
    setBusy(true);
    const prevLiked = liked;
    const prevCount = count;
    setLiked(!prevLiked);
    setCount(prevLiked ? prevCount - 1 : prevCount + 1);
    try {
      const result = await toggleVideoLikeAction(videoId);
      setLiked(result.likedByMe);
      setCount(result.count);
    } catch {
      setLiked(prevLiked);
      setCount(prevCount);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      className={`flex h-9 w-fit items-center gap-1.5 rounded-full border px-4 text-xs font-medium transition-colors disabled:opacity-50 ${
        liked
          ? "border-transparent bg-accent text-on-accent hover:bg-accent-hover"
          : "border-black/10 hover:bg-black/[.03] dark:border-white/15 dark:hover:bg-white/[.05]"
      }`}
    >
      {liked ? "♥" : "♡"} {count}
    </button>
  );
}
