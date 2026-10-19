"use client";

import { useRef } from "react";

export function AttachmentButton({
  onFileSelected,
  disabled,
}: {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        aria-label="Attach a file"
        className="flex h-9 w-9 items-center justify-center rounded-full text-base transition-colors hover:bg-black/[.05] disabled:opacity-50 dark:hover:bg-white/[.08]"
      >
        📎
      </button>
      <input
        ref={inputRef}
        type="file"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFileSelected(file);
          e.target.value = "";
        }}
      />
    </>
  );
}
