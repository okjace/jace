import { NextResponse } from "next/server";
import { apiError, authorizeVideos, createUpload, readJsonObject } from "@/lib/videoApi";

/**
 * Starts an upload: { kind: "video" | "thumbnail", filename, content_type, size }
 * → a signed URL the browser sends the file to directly. Official apps only.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const caller = await authorizeVideos(request, { write: "upload videos" });
  if (caller instanceof NextResponse) return caller;
  const body = readJsonObject(await request.json().catch(() => null));
  if (!body) return apiError("invalid_request", "Send a JSON object.", 400);

  const result = await createUpload(caller.user!, body);
  if ("error" in result) return apiError("invalid_request", result.error, 400);
  return NextResponse.json(result);
}
