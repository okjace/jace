import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import type { ProjectRecord } from "@/lib/types";

/** One of the company's projects, as shown on the home page and /projects. */
export function ProjectCard({ project }: { project: ProjectRecord }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-5 text-left">
      <Link href={`/projects/${project.id}`} className="flex items-center gap-3">
        <Avatar name={project.name} imageUrl={project.iconUrl} size={44} shape="square" />
        <h2 className="text-lg font-semibold tracking-tight hover:underline">{project.name}</h2>
      </Link>
      <p className="line-clamp-4 flex-1 text-sm text-muted">
        {project.description || "No description yet."}
      </p>
      <div className="flex flex-wrap gap-2">
        {project.websiteUrl && (
          <a
            href={project.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="h-8 rounded-full bg-accent px-3 text-xs font-medium leading-8 text-on-accent transition-colors hover:bg-accent-hover"
          >
            Open
          </a>
        )}
        {project.sourceUrl && (
          <a
            href={project.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="h-8 rounded-full border border-line px-3 text-xs font-medium leading-8 transition-colors hover:bg-black/[.03] dark:hover:bg-white/[.05]"
          >
            Source
          </a>
        )}
        <Link
          href={`/projects/${project.id}`}
          className="h-8 rounded-full border border-line px-3 text-xs font-medium leading-8 transition-colors hover:bg-black/[.03] dark:hover:bg-white/[.05]"
        >
          Details
        </Link>
      </div>
    </div>
  );
}
