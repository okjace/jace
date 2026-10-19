import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import {
  getAvatarUrlsByIds,
  getOwnerAvatarUrls,
  getProjectById,
  isCompanyProject,
} from "@/lib/store";
import { canManageOwned } from "@/lib/permissions";
import { Avatar } from "@/components/Avatar";
import { Comments } from "@/components/Comments";
import { MarkdownContent } from "@/components/forums/MarkdownContent";
import { AddVersionForm } from "@/components/projects/AddVersionForm";
import { ProjectEditor } from "@/components/projects/ProjectEditor";
import { VersionCard } from "@/components/projects/VersionCard";
import {
  addProjectCommentAction,
  deleteProjectCommentAction,
  setProjectCommentPinnedAction,
} from "./actions";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const session = await auth();

  const project = await getProjectById(projectId);
  // Only the company's own projects are shown; anyone else's are kept but hidden.
  if (!project || !isCompanyProject(project)) notFound();

  const canManage =
    !!session?.user?.id && (await canManageOwned(project, session.user.id));

  const ownerHref =
    project.ownerType === "org"
      ? `/orgs/${project.ownerId}`
      : `/profile/${project.ownerId}`;
  const [avatarUrls, commentAuthorUrls] = await Promise.all([
    getOwnerAvatarUrls([{ id: project.ownerId, type: project.ownerType }]),
    getAvatarUrlsByIds(project.comments.map((c) => c.authorId)),
  ]);

  const openIssueCount = project.issues.filter((i) => i.status === "open").length;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-10">
      {project.bannerUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={project.bannerUrl}
          alt=""
          className="h-40 w-full rounded-lg object-cover"
        />
      )}
      <div className="flex items-center gap-4">
        <Avatar
          name={project.name}
          imageUrl={project.iconUrl}
          size={64}
          shape="square"
        />
        <div>
          <h1 className="text-xl font-semibold">{project.name}</h1>
          <Link
            href={ownerHref}
            className="flex w-fit items-center gap-1.5 text-sm text-zinc-500 hover:underline dark:text-zinc-400"
          >
            <Avatar
              name={project.ownerName}
              imageUrl={avatarUrls.get(project.ownerId)}
              size={16}
            />
            by {project.ownerName}
          </Link>
        </div>
      </div>

      {project.description && (
        <p className="whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">
          {project.description}
        </p>
      )}

      {(project.websiteUrl || project.sourceUrl) && (
        <div className="flex flex-wrap gap-2">
          {project.websiteUrl && (
            <a
              href={project.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="h-9 rounded-full bg-accent px-4 text-xs font-medium leading-9 text-on-accent transition-colors hover:bg-accent-hover"
            >
              Open {project.name}
            </a>
          )}
          {project.sourceUrl && (
            <a
              href={project.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="h-9 rounded-full border border-black/10 px-4 text-xs font-medium leading-9 transition-colors hover:bg-black/[.03] dark:border-white/15 dark:hover:bg-white/[.05]"
            >
              Source code
            </a>
          )}
        </div>
      )}

      {canManage && (
        <ProjectEditor
          projectId={project.id}
          name={project.name}
          description={project.description}
          readme={project.readme}
          iconUrl={project.iconUrl}
          websiteUrl={project.websiteUrl}
          sourceUrl={project.sourceUrl}
          sortOrder={project.sortOrder}
        />
      )}

      {project.readme && (
        <div className="rounded-lg border border-black/10 p-4 dark:border-white/15">
          <MarkdownContent>{project.readme}</MarkdownContent>
        </div>
      )}

      <Link
        href={`/projects/${project.id}/issues`}
        className="flex w-fit items-center gap-2 rounded-full border border-black/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/[.03] dark:border-white/15 dark:hover:bg-white/[.05]"
      >
        Issues
        {openIssueCount > 0 && (
          <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-on-accent">
            {openIssueCount} open
          </span>
        )}
      </Link>

      {canManage && (
        <div className="rounded-lg border border-black/10 p-4 dark:border-white/15">
          <h2 className="mb-3 text-sm font-semibold">Add a version</h2>
          <AddVersionForm projectId={project.id} />
        </div>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold">Versions</h2>
        {project.versions.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No versions published yet.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {project.versions.map((version) => (
              <VersionCard
                key={version.id}
                projectId={project.id}
                version={version}
                canManage={canManage}
              />
            ))}
          </div>
        )}
      </div>

      <Comments
        comments={project.comments}
        avatarUrls={commentAuthorUrls}
        currentUserId={session?.user?.id}
        canModerate={canManage}
        addAction={addProjectCommentAction.bind(null, project.id)}
        deleteAction={deleteProjectCommentAction.bind(null, project.id)}
        attachmentPathPrefix={`projects/${project.id}/comments`}
        onTogglePin={setProjectCommentPinnedAction.bind(null, project.id)}
      />
    </div>
  );
}
