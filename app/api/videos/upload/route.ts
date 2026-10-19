import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPostBlockReason } from "@/lib/permissions";
import { createSignedUploadUrl } from "@/lib/storage";

export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blockReason = await getPostBlockReason(session.user.id, "upload videos");
  if (blockReason) return NextResponse.json({ error: blockReason }, { status: 403 });

  const { pathname } = (await request.json()) as { pathname?: string };
  if (!pathname) {
    return NextResponse.json({ error: "Missing pathname" }, { status: 400 });
  }

  const { path, signedUrl } = await createSignedUploadUrl(pathname);
  return NextResponse.json({ path, signedUrl });
}
