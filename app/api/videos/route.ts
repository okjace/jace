import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { auth } from "@/auth";
import { getPostBlockReason } from "@/lib/permissions";
import { addVideo, getOrgById, listPublicVideos } from "@/lib/store";
import type { VideoVisibility } from "@/lib/types";

const VISIBILITIES: VideoVisibility[] = ["public", "unlisted", "private"];

export async function GET(): Promise<NextResponse> {
  const videos = await listPublicVideos();
  return NextResponse.json({ videos });
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const blockReason = await getPostBlockReason(session.user.id, "upload videos");
  if (blockReason) return NextResponse.json({ error: blockReason }, { status: 403 });

  const {
    url,
    pathname,
    title,
    description,
    thumbnailUrl,
    contentType,
    size,
    postAsOrgId,
    visibility,
  } = (await request.json()) as {
    url: string;
    pathname: string;
    title: string;
    description: string;
    thumbnailUrl?: string;
    contentType: string;
    size: number;
    postAsOrgId?: string;
    visibility?: unknown;
  };

  if (!url || !pathname || !title) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  let ownerId = session.user.id;
  let ownerType: "user" | "org" = "user";
  let ownerName = session.user.name ?? "Anonymous";

  if (postAsOrgId) {
    const org = await getOrgById(postAsOrgId);
    if (!org || !org.memberIds.includes(session.user.id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    ownerId = org.id;
    ownerType = "org";
    ownerName = org.name;
  }

  const record = {
    id: randomUUID(),
    url,
    pathname,
    title: title.slice(0, 140),
    description: (description ?? "").slice(0, 2000),
    thumbnailUrl: thumbnailUrl || undefined,
    contentType: contentType ?? "video/mp4",
    size: size ?? 0,
    ownerId,
    ownerType,
    ownerName,
    visibility: VISIBILITIES.includes(visibility as VideoVisibility)
      ? (visibility as VideoVisibility)
      : "public",
    comments: [],
    createdAt: new Date().toISOString(),
  };

  await addVideo(record);

  return NextResponse.json({ video: record }, { status: 201 });
}
