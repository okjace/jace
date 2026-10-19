import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getAvatarUrlsByIds, getProjectById } from "@/lib/store";
import { canManageOwned } from "@/lib/permissions";
import { Avatar } from "@/components/Avatar";
import { Comments } from "@/components/Comments";
import { MarkdownContent } from "@/components/forums/MarkdownContent";
import { IssueStatusControl } from "@/components/projects/IssueStatusControl";
import {
  addIssueCommentAction,
  deleteIssueCommentAction,
  setIssueCommentPinnedAction,
} from "../../actions";

const TYPE_LABEL: Record<string, string> = { bug: "Bug", feature: "Feature request" };
const TYPE_CLASS: Record<string, string> = {
  bug: "bg-red-500/10 text-red-600 dark:text-red-400",
  feature: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
};

export default async function IssuePage({
  params,
}: {
  params: Promise<{ projectId: string; issueId: string }>;
}) {
  const { projectId, issueId } = await params;
  const session = await auth();

  const project = await getProjectById(projectId);
  if (!project) notFound();

  const issue = project.issues.find((i) => i.id === issueId);
  if (!issue) notFound();

  const canManageProject =
    !!session?.user?.id && (await canManageOwned(project, session.user.id));
  // Matches assertCanModerateIssue in actions.ts: the issue's own author can
  // also open/close/delete it, not just project maintainers.
  const canCloseOrDeleteIssue =
    canManageProject || issue.authorId === session?.user?.id;

  const [authorUrls, commentAuthorUrls] = await Promise.all([
    getAvatarUrlsByIds([issue.authorId]),
    getAvatarUrlsByIds(issue.comments.map((c) => c.authorId)),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <Link
          href={`/projects/${projectId}/issues`}
          className="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
        >
          ← Issues
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_CLASS[issue.type]}`}>
            {TYPE_LABEL[issue.type]}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              issue.status === "open"
                ? "bg-green-500/10 text-green-600 dark:text-green-400"
                : "bg-black/10 text-zinc-600 dark:bg-white/10 dark:text-zinc-400"
            }`}
          >
            {issue.status === "open" ? "Open" : "Closed"}
          </span>
        </div>
        <h1 className="mt-2 text-2xl font-semibold">{issue.title}</h1>
        <Link
          href={`/profile/${issue.authorId}`}
          className="mt-2 flex w-fit items-center gap-2 text-sm text-zinc-500 hover:underline dark:text-zinc-400"
        >
          <Avatar
            name={issue.authorName}
            imageUrl={authorUrls.get(issue.authorId)}
            size={20}
          />
          {issue.authorName} opened this on{" "}
          {new Date(issue.createdAt).toLocaleDateString()}
        </Link>
      </div>

      {issue.body && (
        <div className="rounded-2xl border border-line bg-panel p-5">
          <MarkdownContent>{issue.body}</MarkdownContent>
        </div>
      )}

      {canCloseOrDeleteIssue && (
        <IssueStatusControl
          projectId={projectId}
          issueId={issue.id}
          status={issue.status}
        />
      )}

      <Comments
        comments={issue.comments}
        avatarUrls={commentAuthorUrls}
        currentUserId={session?.user?.id}
        canModerate={canManageProject}
        addAction={addIssueCommentAction.bind(null, projectId, issue.id)}
        deleteAction={deleteIssueCommentAction.bind(null, projectId, issue.id)}
        attachmentPathPrefix={`projects/${projectId}/issues/${issue.id}/comments`}
        onTogglePin={setIssueCommentPinnedAction.bind(null, projectId, issue.id)}
      />
    </div>
  );
}
