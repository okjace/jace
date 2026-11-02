import { NextResponse } from "next/server";
import { apiError } from "@/lib/integration";
import {
  authorizeSync,
  deleteSyncRecord,
  getSyncRecord,
  isSyncCollection,
  MAX_SYNC_PAYLOAD_BYTES,
  putSyncRecord,
  type SyncRecord,
} from "@/lib/browserSync";

const NO_STORE = { "Cache-Control": "no-store" };

function toWire(r: SyncRecord) {
  return {
    collection: r.collection,
    payload: r.payload,
    version: r.version,
    updated_by: r.updatedBy,
    updated_at: r.updatedAt,
  };
}

/** One collection's encrypted payload and version (404 if it was never written). */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/oauth/sync/[collection]">,
): Promise<NextResponse> {
  const caller = await authorizeSync(request);
  if (caller instanceof NextResponse) return caller;
  const { collection } = await ctx.params;
  if (!isSyncCollection(collection)) return apiError("not_found", "Unknown sync collection.", 404);
  const record = await getSyncRecord(caller.user.id, collection);
  if (!record) return apiError("not_found", "Nothing synced in this collection yet.", 404);
  return NextResponse.json(toWire(record), { headers: { ...NO_STORE, ETag: `"${record.version}"` } });
}

/**
 * Replaces a collection. Body: { payload: "<base64 ciphertext>", device?: "name" }.
 * Header If-Match: "<version you read>" ("0" for a new collection). On a
 * mismatch it answers 412 with the current version, so the browser can
 * download, merge, and try again.
 */
export async function PUT(
  request: Request,
  ctx: RouteContext<"/api/oauth/sync/[collection]">,
): Promise<NextResponse> {
  const caller = await authorizeSync(request);
  if (caller instanceof NextResponse) return caller;
  const { collection } = await ctx.params;
  if (!isSyncCollection(collection)) return apiError("not_found", "Unknown sync collection.", 404);

  const ifMatch = request.headers.get("if-match")?.replace(/"/g, "").trim();
  const expected = ifMatch === undefined || ifMatch === "" ? NaN : Number(ifMatch);
  if (!Number.isInteger(expected) || expected < 0) {
    return apiError("invalid_request", 'Send If-Match: "<version>" ("0" for a new collection).', 428);
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const payload = body && typeof body.payload === "string" ? body.payload : null;
  if (!payload || !/^[A-Za-z0-9+/=_-]+$/.test(payload)) {
    return apiError("invalid_request", "payload must be base64 ciphertext.", 400);
  }
  if (payload.length > MAX_SYNC_PAYLOAD_BYTES) {
    return apiError("payload_too_large", `A collection can be at most ${MAX_SYNC_PAYLOAD_BYTES} bytes.`, 413);
  }
  const device = typeof body?.device === "string" ? body.device.slice(0, 80) : null;

  const result = await putSyncRecord(caller.user.id, collection, payload, expected, device);
  if (!result.ok) {
    return NextResponse.json(
      {
        error: "version_conflict",
        error_description: "Someone else wrote this collection first; download, merge, and try again.",
        version: result.current?.version ?? 0,
      },
      { status: 412, headers: NO_STORE },
    );
  }
  return NextResponse.json(
    { version: result.record.version, updated_at: result.record.updatedAt },
    { headers: { ...NO_STORE, ETag: `"${result.record.version}"` } },
  );
}

export async function DELETE(
  request: Request,
  ctx: RouteContext<"/api/oauth/sync/[collection]">,
): Promise<NextResponse> {
  const caller = await authorizeSync(request);
  if (caller instanceof NextResponse) return caller;
  const { collection } = await ctx.params;
  if (!isSyncCollection(collection)) return apiError("not_found", "Unknown sync collection.", 404);
  return NextResponse.json({ deleted: await deleteSyncRecord(caller.user.id, collection) }, { headers: NO_STORE });
}
