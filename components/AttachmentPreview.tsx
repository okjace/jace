import type { Attachment } from "@/lib/types";
import { formatBytes } from "@/lib/format";

export function AttachmentPreview({ attachment }: { attachment: Attachment }) {
  if (attachment.type.startsWith("image/")) {
    return (
      <a href={attachment.url} target="_blank" rel="noopener noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attachment.url}
          alt={attachment.name}
          className="mt-2 max-h-64 w-auto max-w-full rounded-md border border-line object-contain"
        />
      </a>
    );
  }

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 flex w-fit items-center gap-2 rounded-md border border-line px-3 py-2 text-sm hover:bg-foreground/[.05]"
    >
      📎 {attachment.name}
      <span className="text-xs text-zinc-500 dark:text-zinc-400">
        ({formatBytes(attachment.size)})
      </span>
    </a>
  );
}
