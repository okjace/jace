"use client";

/**
 * PUTs a file directly to a Supabase Storage signed upload URL, replicating
 * `uploadToSignedUrl` from `@supabase/storage-js` by hand (same endpoint,
 * same multipart body shape) so we get `xhr.upload.onprogress` — something
 * `fetch` can't give us, and the SDK helper doesn't expose either.
 */
export function uploadToSignedUrl(
  signedUrl: string,
  file: File,
  onProgress?: (percentage: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader(
      "apikey",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    );
    xhr.setRequestHeader(
      "Authorization",
      `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
    );
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("Upload failed."));

    const formData = new FormData();
    formData.append("cacheControl", "3600");
    formData.append("", file);
    xhr.send(formData);
  });
}

export function supabasePublicUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  return `${base}/storage/v1/object/public/uploads/${path}`;
}

type UploadedFile = { name: string; url: string; size: number };

/** Uploads every file in `fileList` to Supabase Storage via a signed URL, reporting combined progress. */
export async function uploadAll(
  pathPrefix: string,
  fileList: FileList | null,
  onProgress: (pct: number) => void,
): Promise<UploadedFile[]> {
  if (!fileList || fileList.length === 0) return [];
  const files = Array.from(fileList);
  const results: UploadedFile[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const pathname = `${pathPrefix}/${crypto.randomUUID()}-${file.name}`;

    const res = await fetch("/api/uploads/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pathname }),
    });
    if (!res.ok) throw new Error("Could not start upload.");
    const { path, signedUrl } = (await res.json()) as {
      path: string;
      signedUrl: string;
    };

    await uploadToSignedUrl(signedUrl, file, (percentage) => {
      onProgress(Math.round(((i + percentage / 100) / files.length) * 100));
    });

    results.push({ name: file.name, url: supabasePublicUrl(path), size: file.size });
  }

  return results;
}

export type Attachment = { name: string; url: string; type: string; size: number };

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** Uploads a single file (an image or generic attachment on a comment/message/post) to Supabase Storage. */
export async function uploadAttachment(
  pathPrefix: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<Attachment> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error("Attachments must be 10MB or smaller.");
  }

  const pathname = `${pathPrefix}/${crypto.randomUUID()}-${file.name}`;
  const res = await fetch("/api/uploads/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pathname }),
  });
  if (!res.ok) throw new Error("Could not start upload.");
  const { path, signedUrl } = (await res.json()) as { path: string; signedUrl: string };

  await uploadToSignedUrl(signedUrl, file, onProgress);

  return {
    name: file.name,
    url: supabasePublicUrl(path),
    type: file.type || "application/octet-stream",
    size: file.size,
  };
}
