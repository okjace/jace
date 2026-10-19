import "server-only";
import type { Attachment } from "./types";

/**
 * Parses and validates an attachment coming from client input — either a
 * JSON-encoded FormData field (comments, forum posts) or an already-parsed
 * JSON body field (chat/DM API routes). Rejects anything not actually
 * pointing at our own Supabase Storage bucket, since this ends up rendered
 * back as an `<img src>` / link to every viewer.
 */
export function parseAttachment(raw: unknown): Attachment | undefined {
  let obj: unknown = raw;
  if (typeof raw === "string") {
    if (!raw) return undefined;
    try {
      obj = JSON.parse(raw);
    } catch {
      return undefined;
    }
  }

  if (
    !obj ||
    typeof obj !== "object" ||
    typeof (obj as Record<string, unknown>).url !== "string" ||
    typeof (obj as Record<string, unknown>).name !== "string" ||
    typeof (obj as Record<string, unknown>).type !== "string" ||
    typeof (obj as Record<string, unknown>).size !== "number"
  ) {
    return undefined;
  }

  const a = obj as { url: string; name: string; type: string; size: number };
  const storageBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/uploads/`;
  if (!a.url.startsWith(storageBase)) return undefined;

  return {
    url: a.url,
    name: a.name.slice(0, 200),
    type: a.type.slice(0, 200),
    size: a.size,
  };
}
