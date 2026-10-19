import "server-only";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "uploads";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export function getPublicUrl(path: string): string {
  return admin().storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Server-side direct upload for small files (avatars, banners, icons). */
export async function uploadFile(
  path: string,
  data: File | Blob | Buffer,
  contentType: string,
): Promise<string> {
  const { error } = await admin()
    .storage.from(BUCKET)
    .upload(path, data, { contentType, upsert: true });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return getPublicUrl(path);
}

/**
 * For large files uploaded directly from the browser (videos, project
 * files) — the server never sees the bytes, avoiding the platform's request
 * body size limit. The client PUTs to `signedUrl` itself; see
 * lib/clientUpload.ts.
 */
export async function createSignedUploadUrl(
  path: string,
): Promise<{ path: string; signedUrl: string }> {
  const { data, error } = await admin()
    .storage.from(BUCKET)
    .createSignedUploadUrl(path, { upsert: true });
  if (error || !data) {
    throw new Error(`Could not create upload URL: ${error?.message}`);
  }
  return { path: data.path, signedUrl: data.signedUrl };
}

function urlToPath(url: string): string | null {
  const marker = `/object/public/${BUCKET}/`;
  const idx = url.indexOf(marker);
  return idx === -1 ? null : decodeURIComponent(url.slice(idx + marker.length));
}

/** Best-effort delete: never let an already-gone file block a delete. */
export async function deleteFiles(urls: (string | undefined | null)[]): Promise<void> {
  const paths = urls
    .filter((u): u is string => !!u)
    .map(urlToPath)
    .filter((p): p is string => !!p);
  if (paths.length === 0) return;
  try {
    await admin().storage.from(BUCKET).remove(paths);
  } catch {
    // Ignore — the row is the source of truth; an orphaned file is harmless.
  }
}
