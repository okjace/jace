import Link from "next/link";
import { auth } from "@/auth";
import { isAdmin, listCompanyProjects } from "@/lib/store";
import { ProjectCard } from "@/components/projects/ProjectCard";

export default async function ProjectsPage() {
  const session = await auth();
  const [projects, canAdd] = await Promise.all([
    listCompanyProjects(),
    isAdmin(session?.user?.id),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projects</h1>
        {canAdd && (
          <Link
            href="/projects/new"
            className="h-10 rounded-full bg-accent px-4 text-sm font-medium leading-10 text-on-accent transition-colors hover:bg-accent-hover"
          >
            New project
          </Link>
        )}
      </div>

      {projects.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No projects yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
