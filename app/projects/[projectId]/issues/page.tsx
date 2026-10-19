import Link from "next/link";
import { notFound } from "next/navigation";
import { getProjectById } from "@/lib/store";

const TYPE_LABEL: Record<string, string> = { bug: "Bug", feature: "Feature request" };
const TYPE_CLASS: Record<string, string> = {
  bug: "bg-red-500/10 text-red-600 dark:text-red-400",
  feature: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
};

export default async function ProjectIssuesPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { projectId } = await params;
  const { status } = await searchParams;
  const filter = status === "closed" ? "closed" : status === "all" ? "all" : "open";

  const project = await getProjectById(projectId);
  if (!project) notFound();

  const issues = [...project.issues]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .filter((issue) => filter === "all" || issue.status === filter);

  const openCount = project.issues.filter((i) => i.status === "open").length;
  const closedCount = project.issues.filter((i) => i.status === "closed").length;

  function tabHref(value: string) {
    return `/projects/${projectId}/issues${value === "open" ? "" : `?status=${value}`}`;
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <Link
          href={`/projects/${projectId}`}
          className="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
        >
          ← {project.name}
        </Link>
        <div className="mt-1 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Issues</h1>
          <Link
            href={`/projects/${projectId}/issues/new`}
            className="h-9 rounded-full bg-accent px-4 text-sm font-medium leading-9 text-on-accent transition-colors hover:bg-accent-hover"
          >
            New issue
          </Link>
        </div>
      </div>

      <div className="flex gap-4 border-b border-black/10 text-sm dark:border-white/15">
        {[
          { value: "open", label: `Open (${openCount})` },
          { value: "closed", label: `Closed (${closedCount})` },
          { value: "all", label: "All" },
        ].map((tab) => (
          <Link
            key={tab.value}
            href={tabHref(tab.value)}
            className={`-mb-px border-b-2 px-1 pb-2 ${
              filter === tab.value
                ? "border-foreground font-medium"
                : "border-transparent text-zinc-500 hover:text-foreground dark:text-zinc-400"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {issues.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No {filter === "all" ? "" : filter} issues.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-black/10 dark:divide-white/15">
          {issues.map((issue) => (
            <Link
              key={issue.id}
              href={`/projects/${projectId}/issues/${issue.id}`}
              className="flex items-start justify-between gap-3 py-3 transition-colors hover:bg-black/[.03] dark:hover:bg-white/[.05]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_CLASS[issue.type]}`}
                  >
                    {TYPE_LABEL[issue.type]}
                  </span>
                  {issue.status === "closed" && (
                    <span className="rounded-full bg-black/10 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-white/10 dark:text-zinc-400">
                      Closed
                    </span>
                  )}
                  <span className="truncate text-sm font-medium">{issue.title}</span>
                </div>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {issue.authorName} · {new Date(issue.createdAt).toLocaleDateString()}
                  {issue.comments.length > 0 &&
                    ` · ${issue.comments.length} comment${issue.comments.length === 1 ? "" : "s"}`}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
