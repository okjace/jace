"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  addIssueComment,
  addProjectComment,
  addProjectIssue,
  awaitReadYourWrite,
  deleteProject,
  deleteIssueComment,
  deleteProjectComment,
  deleteProjectIssue,
  getProjectById,
  getUserById,
  pinIssueComment,
  pinProjectComment,
  unpinIssueComment,
  unpinProjectComment,
  updateProject,
  updateProjectIssue,
  setProjectGitHubRepo,
} from "@/lib/store";
import { parseAttachment } from "@/lib/attachments";
import { canManageOwned, getPostBlockReason } from "@/lib/permissions";
import { uploadFile } from "@/lib/storage";
import { getGitHubRepo, parseGitHubRepo, syncProjectFromGitHub } from "@/lib/github";
import type { IssueType } from "@/lib/types";
import { checkAutomod, checkImages, hasImage } from "@/lib/automod";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

async function uploadImage(
  file: FormDataEntryValue | null,
  pathPrefix: string,
): Promise<string | undefined> {
  if (!(file instanceof File) || file.size === 0) return undefined;
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Images must be 4MB or smaller.");
  }
  if (!file.type.startsWith("image/")) {
    throw new Error("File must be an image.");
  }
  return uploadFile(`${pathPrefix}/${randomUUID()}`, file, file.type);
}

const canManageProject = canManageOwned;

async function assertCanManage(projectId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const project = await getProjectById(projectId);
  if (!project) throw new Error("Project not found");

  if (!(await canManageProject(project, session.user.id))) {
    throw new Error("Forbidden");
  }
  return project;
}

/** "" clears the link; anything else must be an http(s) URL ("example.com" gets https://). */
function optionalUrl(value: FormDataEntryValue | null): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
    return url.href.slice(0, 500);
  } catch {
    throw new Error(`"${raw}" isn't a valid link.`);
  }
}

export async function updateProjectAction(
  projectId: string,
  formData: FormData,
) {
  await assertCanManage(projectId);

  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const description = String(formData.get("description") ?? "")
    .trim()
    .slice(0, 2000);
  const readme = String(formData.get("readme") ?? "").slice(0, 20000);

  if (name.length < 2) throw new Error("Project name is too short.");
  const websiteUrl = optionalUrl(formData.get("websiteUrl"));
  const sourceUrl = optionalUrl(formData.get("sourceUrl"));
  const sortOrder = Math.trunc(Number(formData.get("sortOrder") ?? 0)) || 0;
  const githubInput = String(formData.get("githubRepo") ?? "").trim();
  const githubRepo = githubInput ? parseGitHubRepo(githubInput) : null;
  if (githubInput && !githubRepo) {
    throw new Error("Enter the GitHub repository as owner/repo or its github.com link.");
  }

  const iconUrl = await uploadImage(formData.get("icon"), "projects/icons");
  const bannerUrl = await uploadImage(
    formData.get("banner"),
    "projects/banners",
  );

  await updateProject(projectId, {
    name,
    description,
    readme,
    websiteUrl,
    sourceUrl,
    sortOrder,
    ...(iconUrl ? { iconUrl } : {}),
    ...(bannerUrl ? { bannerUrl } : {}),
  });

  // Linking a new repository (or a different one) syncs right away; clearing the field unlinks.
  const project = await getProjectById(projectId);
  if (!githubRepo) {
    if (project?.githubRepo) await setProjectGitHubRepo(projectId, null);
  } else if (githubRepo.toLowerCase() !== project?.githubRepo?.toLowerCase()) {
    const repo = await getGitHubRepo(githubRepo);
    if ("error" in repo) throw new Error(repo.error);
    await setProjectGitHubRepo(projectId, repo.fullName);
    await syncProjectFromGitHub(projectId);
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/");
}

/** The "Sync now" button on a GitHub-linked project. */
export async function syncProjectGitHubAction(projectId: string): Promise<{ error?: string }> {
  await assertCanManage(projectId);
  const result = await syncProjectFromGitHub(projectId);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/");
  return result;
}

export async function deleteProjectAction(projectId: string) {
  await assertCanManage(projectId);
  await deleteProject(projectId);
  await awaitReadYourWrite(async () => (await getProjectById(projectId)) === null);
  revalidatePath("/projects");
}

export async function addProjectCommentAction(projectId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const blockReason = await getPostBlockReason(session.user.id);
  if (blockReason) throw new Error(blockReason);

  const body = String(formData.get("body") ?? "").trim().slice(0, 2000);
  const attachment = parseAttachment(formData.get("attachment"));
  if (!body && !attachment) throw new Error("Comment can't be empty.");
  const automodComment =
    (await checkAutomod(session.user.id, "a project comment", body)) ??
    (await checkImages(session.user.id, "a project comment", "post", hasImage([body], attachment)));
  if (automodComment) throw new Error(automodComment);

  const user = await getUserById(session.user.id);
  if (!user) throw new Error("Unauthorized");

  await addProjectComment(projectId, {
    id: randomUUID(),
    body,
    authorId: user.id,
    authorName: user.username,
    ...(attachment ? { attachment } : {}),
    createdAt: new Date().toISOString(),
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteProjectCommentAction(projectId: string, commentId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const project = await getProjectById(projectId);
  if (!project) throw new Error("Project not found");

  const comment = project.comments.find((c) => c.id === commentId);
  if (!comment) return;

  const isAuthor = comment.authorId === session.user.id;
  if (!isAuthor && !(await canManageProject(project, session.user.id))) {
    throw new Error("Forbidden");
  }

  await deleteProjectComment(projectId, commentId);
  revalidatePath(`/projects/${projectId}`);
}

export async function setProjectCommentPinnedAction(
  projectId: string,
  commentId: string,
  pinned: boolean,
) {
  await assertCanManage(projectId);
  if (pinned) {
    await pinProjectComment(projectId, commentId);
  } else {
    await unpinProjectComment(projectId, commentId);
  }
  revalidatePath(`/projects/${projectId}`);
}

export async function createIssueAction(projectId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const blockReason = await getPostBlockReason(session.user.id);
  if (blockReason) throw new Error(blockReason);

  const title = String(formData.get("title") ?? "").trim().slice(0, 140);
  const body = String(formData.get("body") ?? "").trim().slice(0, 10000);
  const typeRaw = String(formData.get("type") ?? "bug");
  const type: IssueType = typeRaw === "feature" ? "feature" : "bug";

  if (!title) throw new Error("Give the issue a title.");
  const automodIssue =
    (await checkAutomod(session.user.id, "an issue", title, body)) ??
    (await checkImages(session.user.id, "an issue", "post", hasImage([title, body])));
  if (automodIssue) throw new Error(automodIssue);

  const user = await getUserById(session.user.id);
  if (!user) throw new Error("Unauthorized");

  const issue = {
    id: randomUUID(),
    title,
    body,
    type,
    status: "open" as const,
    authorId: user.id,
    authorName: user.username,
    comments: [],
    createdAt: new Date().toISOString(),
  };

  await addProjectIssue(projectId, issue);
  revalidatePath(`/projects/${projectId}/issues`);
  return issue;
}

async function assertCanModerateIssue(projectId: string, issueId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const project = await getProjectById(projectId);
  if (!project) throw new Error("Project not found");

  const issue = project.issues.find((i) => i.id === issueId);
  if (!issue) throw new Error("Issue not found");

  const isAuthor = issue.authorId === session.user.id;
  if (!isAuthor && !(await canManageProject(project, session.user.id))) {
    throw new Error("Forbidden");
  }
}

export async function setIssueStatusAction(
  projectId: string,
  issueId: string,
  status: "open" | "closed",
) {
  await assertCanModerateIssue(projectId, issueId);
  await updateProjectIssue(projectId, issueId, { status });
  revalidatePath(`/projects/${projectId}/issues/${issueId}`);
  revalidatePath(`/projects/${projectId}/issues`);
}

export async function deleteIssueAction(projectId: string, issueId: string) {
  await assertCanModerateIssue(projectId, issueId);
  await deleteProjectIssue(projectId, issueId);
  revalidatePath(`/projects/${projectId}/issues`);
}

export async function addIssueCommentAction(
  projectId: string,
  issueId: string,
  formData: FormData,
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const blockReason = await getPostBlockReason(session.user.id);
  if (blockReason) throw new Error(blockReason);

  const body = String(formData.get("body") ?? "").trim().slice(0, 2000);
  const attachment = parseAttachment(formData.get("attachment"));
  if (!body && !attachment) throw new Error("Comment can't be empty.");
  const automodIssueComment =
    (await checkAutomod(session.user.id, "an issue comment", body)) ??
    (await checkImages(session.user.id, "an issue comment", "post", hasImage([body], attachment)));
  if (automodIssueComment) throw new Error(automodIssueComment);

  const user = await getUserById(session.user.id);
  if (!user) throw new Error("Unauthorized");

  await addIssueComment(projectId, issueId, {
    id: randomUUID(),
    body,
    authorId: user.id,
    authorName: user.username,
    ...(attachment ? { attachment } : {}),
    createdAt: new Date().toISOString(),
  });
  revalidatePath(`/projects/${projectId}/issues/${issueId}`);
}

export async function deleteIssueCommentAction(
  projectId: string,
  issueId: string,
  commentId: string,
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const project = await getProjectById(projectId);
  if (!project) throw new Error("Project not found");

  const issue = project.issues.find((i) => i.id === issueId);
  if (!issue) return;
  const comment = issue.comments.find((c) => c.id === commentId);
  if (!comment) return;

  const isAuthor = comment.authorId === session.user.id;
  if (!isAuthor && !(await canManageProject(project, session.user.id))) {
    throw new Error("Forbidden");
  }

  await deleteIssueComment(projectId, issueId, commentId);
  revalidatePath(`/projects/${projectId}/issues/${issueId}`);
}

export async function setIssueCommentPinnedAction(
  projectId: string,
  issueId: string,
  commentId: string,
  pinned: boolean,
) {
  await assertCanManage(projectId);
  if (pinned) {
    await pinIssueComment(projectId, issueId, commentId);
  } else {
    await unpinIssueComment(projectId, issueId, commentId);
  }
  revalidatePath(`/projects/${projectId}/issues/${issueId}`);
}
