import "server-only";
import { randomUUID } from "crypto";
import type { ProjectFile, ProjectRecord, ProjectVersion } from "./types";

/**
 * GitHub sync for projects: a project linked to a public repository takes
 * its description, website, README, and releases (as versions) from GitHub.
 * It syncs when the project is created or the link is added, from the "Sync
 * now" button, and in the background when the project page is viewed and
 * the last sync is older than `STALE_AFTER_MS` (see app/projects/[projectId]).
 *
 * Requests use GITHUB_TOKEN if it's set, otherwise the "Sign in with GitHub"
 * OAuth app's id/secret, which GitHub accepts for public data at the same
 * higher rate limit (5,000 requests an hour instead of 60).
 */

export const STALE_AFTER_MS = 15 * 60 * 1000;
const API = "https://api.github.com";
const MAX_RELEASES = 30;

/** Accepts "owner/repo", a github.com URL (with or without .git or a path), or git@github.com:owner/repo. */
export function parseGitHubRepo(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const match =
    raw.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/?#].*)?$/i) ??
    raw.match(/^git@github\.com:([\w.-]+)\/([\w.-]+?)(?:\.git)?$/i) ??
    raw.match(/^([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
  if (!match) return null;
  return `${match[1]}/${match[2]}`;
}

function headers(accept = "application/vnd.github+json"): HeadersInit {
  const h: Record<string, string> = {
    Accept: accept,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "jace-project-sync",
  };
  if (process.env.GITHUB_TOKEN) {
    h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  } else if (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) {
    h.Authorization = `Basic ${Buffer.from(`${process.env.AUTH_GITHUB_ID}:${process.env.AUTH_GITHUB_SECRET}`).toString("base64")}`;
  }
  return h;
}

async function github(path: string, accept?: string): Promise<Response> {
  return fetch(`${API}${path}`, { headers: headers(accept), cache: "no-store" });
}

export type GitHubRepoInfo = {
  fullName: string;
  name: string;
  description: string;
  homepage: string;
  htmlUrl: string;
  defaultBranch: string;
  ownerAvatarUrl: string;
};

/** Looks the repository up; an error message for a missing or private repo. */
export async function getGitHubRepo(repo: string): Promise<GitHubRepoInfo | { error: string }> {
  const res = await github(`/repos/${repo}`);
  if (res.status === 404) return { error: `GitHub repository "${repo}" wasn't found, or it's private.` };
  if (res.status === 403 || res.status === 429) return { error: "GitHub's rate limit was hit. Try again in a few minutes." };
  if (!res.ok) return { error: `GitHub returned an error (${res.status}).` };
  const data = await res.json();
  return {
    fullName: data.full_name,
    name: data.name,
    description: data.description ?? "",
    homepage: data.homepage ?? "",
    htmlUrl: data.html_url,
    defaultBranch: data.default_branch ?? "main",
    ownerAvatarUrl: data.owner?.avatar_url ?? "",
  };
}

/** Points relative Markdown images and links at the repository, so the README renders on Jace like it does on GitHub. */
function absolutizeReadme(markdown: string, repo: GitHubRepoInfo): string {
  const raw = `https://raw.githubusercontent.com/${repo.fullName}/${repo.defaultBranch}/`;
  const blob = `${repo.htmlUrl}/blob/${repo.defaultBranch}/`;
  const isRelative = (url: string) => !/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(url);
  const clean = (url: string) => url.replace(/^\.?\//, "");
  return markdown
    .replace(/(!\[[^\]]*\]\()([^)\s]+)/g, (m, pre, url) => (isRelative(url) ? `${pre}${raw}${clean(url)}` : m))
    .replace(/((?<!!)\[[^\]]*\]\()([^)\s]+)/g, (m, pre, url) => (isRelative(url) ? `${pre}${blob}${clean(url)}` : m));
}

async function getReadme(repo: GitHubRepoInfo): Promise<string> {
  const res = await github(`/repos/${repo.fullName}/readme`, "application/vnd.github.raw");
  if (!res.ok) return "";
  return absolutizeReadme((await res.text()).slice(0, 20000), repo);
}

type GitHubRelease = {
  id: number;
  tag_name: string;
  name: string | null;
  body: string | null;
  draft: boolean;
  published_at: string | null;
  created_at: string;
  html_url: string;
  assets: { id: number; name: string; size: number; browser_download_url: string }[];
};

async function getReleases(repo: string): Promise<GitHubRelease[]> {
  const res = await github(`/repos/${repo}/releases?per_page=${MAX_RELEASES}`);
  if (!res.ok) return [];
  return ((await res.json()) as GitHubRelease[]).filter((r) => !r.draft);
}

/**
 * Releases become versions: label from the release name or tag, notes as
 * the description, assets as files (linked straight to GitHub), and the
 * tag's source zip. A version is matched to its release by id, so syncing
 * again updates it in place instead of adding a copy; versions added on
 * Jace by hand are kept as they are.
 */
function mergeReleases(existing: ProjectVersion[], releases: GitHubRelease[], repo: string): ProjectVersion[] {
  const byRelease = new Map(existing.filter((v) => v.githubReleaseId).map((v) => [v.githubReleaseId, v]));
  const synced = releases.map((r): ProjectVersion => {
    const prior = byRelease.get(r.id);
    const files: ProjectFile[] = r.assets.map((a) => ({
      id: `gh-asset-${a.id}`,
      name: a.name,
      url: a.browser_download_url,
      size: a.size,
    }));
    const tag = encodeURIComponent(r.tag_name);
    return {
      id: prior?.id ?? randomUUID(),
      label: (r.name || r.tag_name).slice(0, 80),
      description: (r.body ?? "").slice(0, 5000),
      files,
      sourceFiles: [
        {
          id: `gh-source-${r.id}`,
          name: `${repo.split("/")[1]}-${r.tag_name}.zip`,
          url: `https://github.com/${repo}/archive/refs/tags/${tag}.zip`,
          size: 0,
        },
      ],
      downloadUrl: r.html_url,
      githubReleaseId: r.id,
      createdAt: r.published_at ?? r.created_at,
    };
  });
  // Hand-made versions stay; synced ones whose release was deleted on GitHub go.
  const kept = existing.filter((v) => !v.githubReleaseId);
  return [...synced, ...kept].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export type GitHubSyncResult = {
  patch: Partial<Pick<ProjectRecord, "description" | "readme" | "websiteUrl" | "sourceUrl" | "versions">>;
  repo: GitHubRepoInfo;
};

/** Fetches everything a sync needs. GitHub's values win, except empty ones never blank out what's on Jace. */
export async function fetchGitHubSync(
  project: Pick<ProjectRecord, "versions">,
  repoName: string,
): Promise<GitHubSyncResult | { error: string }> {
  const repo = await getGitHubRepo(repoName);
  if ("error" in repo) return repo;
  const [readme, releases] = await Promise.all([getReadme(repo), getReleases(repo.fullName)]);
  const patch: GitHubSyncResult["patch"] = {
    sourceUrl: repo.htmlUrl,
    versions: mergeReleases(project.versions, releases, repo.fullName),
  };
  if (repo.description) patch.description = repo.description.slice(0, 2000);
  if (repo.homepage) patch.websiteUrl = /^https?:\/\//i.test(repo.homepage) ? repo.homepage : `https://${repo.homepage}`;
  if (readme) patch.readme = readme;
  return { patch, repo };
}

/** Syncs one project from its linked repository and saves the result (or the error). */
export async function syncProjectFromGitHub(projectId: string): Promise<{ error?: string }> {
  const { getProjectById, saveGitHubSync } = await import("./store");
  const project = await getProjectById(projectId);
  if (!project?.githubRepo) return { error: "This project isn't linked to GitHub." };
  const result = await fetchGitHubSync(project, project.githubRepo);
  await saveGitHubSync(projectId, result);
  return "error" in result ? { error: result.error } : {};
}

export function isSyncStale(project: Pick<ProjectRecord, "githubRepo" | "githubSyncedAt">): boolean {
  if (!project.githubRepo) return false;
  if (!project.githubSyncedAt) return true;
  return Date.now() - Date.parse(project.githubSyncedAt) > STALE_AFTER_MS;
}
