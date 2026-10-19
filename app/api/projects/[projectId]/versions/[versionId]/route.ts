import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  deleteProjectVersion,
  getProjectById,
  updateProjectVersion,
} from "@/lib/store";
import { canManageOwned } from "@/lib/permissions";
import { deleteFiles } from "@/lib/storage";
import type { ProjectFile, ProjectRecord } from "@/lib/types";

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function isFileList(value: unknown): value is Array<Partial<ProjectFile> & { name: string; url: string; size: number }> {
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

async function assertCanManage(
  projectId: string,
): Promise<ProjectRecord | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const project = await getProjectById(projectId);
  if (!project) return null;

  return (await canManageOwned(project, session.user.id)) ? project : null;
}

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/projects/[projectId]/versions/[versionId]">,
): Promise<NextResponse> {
  const { projectId, versionId } = await ctx.params;
  const project = await assertCanManage(projectId);
  if (!project) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existingVersion = project.versions.find((v) => v.id === versionId);
  if (!existingVersion) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
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

  // Clean up storage for any files that were removed in this edit.
  const keptUrls = new Set([...files, ...sourceFiles].map((f) => f.url));
  const removedUrls = [...existingVersion.files, ...existingVersion.sourceFiles]
    .map((f) => f.url)
    .filter((url) => !keptUrls.has(url));
  await deleteFiles(removedUrls);

  const trimmedDownloadUrl =
    typeof downloadUrl === "string" ? normalizeUrl(downloadUrl).slice(0, 500) : "";

  const patch = {
    label: label.slice(0, 40),
    description: String(description ?? "").slice(0, 2000),
    files: files.map((f) => ({ ...f, id: f.id ?? randomUUID() }) as ProjectFile),
    sourceFiles: sourceFiles.map(
      (f) => ({ ...f, id: f.id ?? randomUUID() }) as ProjectFile,
    ),
    // Always set explicitly (even to null) so an emptied field actually clears
    // the old value — a jsonb `||` merge only overwrites keys that are present.
    downloadUrl: trimmedDownloadUrl || null,
  };

  await updateProjectVersion(projectId, versionId, patch);

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/projects/[projectId]/versions/[versionId]">,
): Promise<NextResponse> {
  const { projectId, versionId } = await ctx.params;
  const project = await assertCanManage(projectId);
  if (!project) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const version = project.versions.find((v) => v.id === versionId);
  if (!version) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  await deleteProjectVersion(projectId, versionId);
  await deleteFiles([...version.files, ...version.sourceFiles].map((f) => f.url));

  return NextResponse.json({ ok: true });
}
