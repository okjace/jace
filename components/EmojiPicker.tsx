"use client";

import { useEffect, useRef, useState } from "react";

const EMOJIS = [
  "😀", "😂", "😅", "😊", "😉", "😍", "😘", "😜", "🤔", "🙄",
  "😴", "😭", "😱", "😡", "🥳", "😎", "🤗", "🤝", "👍", "👎",
  "👏", "🙌", "🙏", "💪", "👀", "🔥", "✨", "🎉", "🎈", "💯",
  "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💔", "😢",
  "🚀", "⭐", "✅", "❌", "⚠️", "💡", "📌", "📎", "🐛", "🎮",
];

export function EmojiPicker({
  onSelect,
}: {
  onSelect: (emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Add emoji"
        className="flex h-9 w-9 items-center justify-center rounded-full text-base transition-colors hover:bg-black/[.05] dark:hover:bg-white/[.08]"
      >
        🙂
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-10 mb-2 grid w-64 grid-cols-10 gap-1 rounded-lg border border-black/10 bg-background p-2 shadow-lg dark:border-white/15">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onSelect(emoji);
                setOpen(false);
              }}
              className="flex h-6 w-6 items-center justify-center rounded text-base hover:bg-black/[.05] dark:hover:bg-white/[.08]"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
