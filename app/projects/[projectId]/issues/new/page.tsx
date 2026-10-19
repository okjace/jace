import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getProjectById } from "@/lib/store";
import { NewIssueForm } from "@/components/projects/NewIssueForm";

export default async function NewIssuePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const session = await auth();

  const project = await getProjectById(projectId);
  if (!project) notFound();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <Link
          href={`/projects/${projectId}/issues`}
          className="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
        >
          ← Issues
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">New issue</h1>
      </div>

      {session?.user?.id ? (
        <NewIssueForm projectId={projectId} />
      ) : (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          <Link href="/sign-in" className="underline underline-offset-2">
            Sign in
          </Link>{" "}
          to file an issue.
        </p>
      )}
    </div>
  );
}
