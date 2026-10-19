import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCloudFileData } from "@/lib/store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fileId: string }> },
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { fileId } = await params;
  const result = await getCloudFileData(fileId);
  if (!result || result.meta.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Buffer is a valid Response body at runtime; TS's typed-array generics
  // don't line up with the DOM lib's BodyInit here, so cast explicitly.
  return new NextResponse(result.data as unknown as BodyInit, {
    headers: {
      "Content-Type": result.meta.contentType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(result.meta.name)}"`,
      "Content-Length": String(result.meta.size),
      "Cache-Control": "private, no-store",
    },
  });
}
