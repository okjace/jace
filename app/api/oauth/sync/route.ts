import { NextResponse } from "next/server";
import { authorizeSync, deleteAllSyncData, listSyncMeta, SYNC_COLLECTIONS } from "@/lib/browserSync";

const NO_STORE = { "Cache-Control": "no-store" };

/** The version and last-write time of each of the user's sync collections (no payloads). */
export async function GET(request: Request): Promise<NextResponse> {
  const caller = await authorizeSync(request);
  if (caller instanceof NextResponse) return caller;
  return NextResponse.json(
    { collections: SYNC_COLLECTIONS, records: (await listSyncMeta(caller.user.id)).map(toWire) },
    { headers: NO_STORE },
  );
}

/** Deletes all of the user's sync data (used to reset a forgotten sync passphrase). */
export async function DELETE(request: Request): Promise<NextResponse> {
  const caller = await authorizeSync(request);
  if (caller instanceof NextResponse) return caller;
  return NextResponse.json({ deleted: await deleteAllSyncData(caller.user.id) }, { headers: NO_STORE });
}

function toWire(r: { collection: string; version: number; updatedBy: string | null; updatedAt: string }) {
  return { collection: r.collection, version: r.version, updated_by: r.updatedBy, updated_at: r.updatedAt };
}
