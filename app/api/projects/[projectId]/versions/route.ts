import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { addProjectVersion, getProjectById } from "@/lib/store";
import { canManageOwned, getPostBlockReason } from "@/lib/permissions";
import type { ProjectFile } from "@/lib/types";

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function isFileList(value: unknown): value is ProjectFile[] {
  return (
    Array.isArray(value) &&
    value.every(
      (f) =>
        f &&
        typeof f.name === "string" &&
        typeof f.url === "string" &&
        typeof f.size === "number",
    )
  );
}

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/projects/[projectId]/versions">,
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blockReason = await getPostBlockReason(session.user.id, "publish project versions");
  if (blockReason) return NextResponse.json({ error: blockReason }, { status: 403 });

  const { projectId } = await ctx.params;
  const project = await getProjectById(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (!(await canManageOwned(project, session.user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { label, description, files, sourceFiles, downloadUrl } =
    (await request.json()) as {
      label: string;
      description: string;
      files: unknown;
      sourceFiles: unknown;
      downloadUrl?: unknown;
    };

  if (!label || typeof label !== "string" || label.length > 40) {
    return NextResponse.json({ error: "Invalid version label" }, { status: 400 });
  }
  if (!isFileList(files) || !isFileList(sourceFiles)) {
    return NextResponse.json({ error: "Invalid file list" }, { status: 400 });
  }
  if (downloadUrl !== undefined && typeof downloadUrl !== "string") {
    return NextResponse.json({ error: "Invalid download link" }, { status: 400 });
  }

  const trimmedDownloadUrl =
    typeof downloadUrl === "string" ? normalizeUrl(downloadUrl).slice(0, 500) : "";

  const version = {
    id: randomUUID(),
    label: label.slice(0, 40),
    description: String(description ?? "").slice(0, 2000),
    files: files.map((f) => ({ ...f, id: randomUUID() })),
    sourceFiles: sourceFiles.map((f) => ({ ...f, id: randomUUID() })),
    ...(trimmedDownloadUrl ? { downloadUrl: trimmedDownloadUrl } : {}),
    createdAt: new Date().toISOString(),
  };

  await addProjectVersion(projectId, version);

  return NextResponse.json({ version }, { status: 201 });
}
