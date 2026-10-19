import Link from "next/link";
import { auth } from "@/auth";
import { isAdmin, listCompanyProjects } from "@/lib/store";
import { ProjectCard } from "@/components/projects/ProjectCard";

export default async function Home() {
  const session = await auth();
  const [projects, canEdit] = await Promise.all([
    listCompanyProjects(),
    isAdmin(session?.user?.id),
  ]);

  return (
    <div className="flex flex-1 flex-col items-center px-6 py-20">
      <div className="flex w-full max-w-5xl flex-col items-center gap-6 text-center">
        <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">Jace</h1>
        <p className="text-xl text-muted">A company that makes stuff.</p>

        {!session?.user && (
          <div className="flex gap-3">
            <Link
              href="/sign-up"
              className="h-11 rounded-full bg-accent px-6 text-sm font-medium leading-11 text-on-accent transition-colors hover:bg-accent-hover"
            >
              Create a Jace account
            </Link>
            <Link
              href="/sign-in"
              className="h-11 rounded-full border border-line px-6 text-sm font-medium leading-11 transition-colors hover:bg-black/[.03] dark:hover:bg-white/[.05]"
            >
              Sign in
            </Link>
          </div>
        )}
        <p className="max-w-xl text-sm text-muted">
          One Jace account signs you in to everything below.
        </p>

        <div className="mt-8 flex w-full items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
            Things we made
          </h2>
          {canEdit && (
            <Link href="/projects/new" className="text-xs font-medium underline underline-offset-2">
              + Add a project
            </Link>
          )}
        </div>
        <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
        {canEdit && (
          <p className="text-xs text-muted">
            Open a project&apos;s Details and use &quot;Edit project&quot; to change its
            name, description, links, icon, or order here.
          </p>
        )}
      </div>
    </div>
  );
}
