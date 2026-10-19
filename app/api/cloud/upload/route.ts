import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { addCloudFile } from "@/lib/store";

const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a file." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Files must be 4MB or smaller." },
      { status: 400 },
    );
  }

  const data = Buffer.from(await file.arrayBuffer());
  const meta = {
    id: randomUUID(),
    ownerId: session.user.id,
    name: file.name.slice(0, 200) || "file",
    contentType: file.type || "application/octet-stream",
    size: file.size,
    createdAt: new Date().toISOString(),
  };
  await addCloudFile({ ...meta, data });

  return NextResponse.json({ file: meta }, { status: 201 });
}
