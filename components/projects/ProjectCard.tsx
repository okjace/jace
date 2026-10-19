import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import type { ProjectRecord } from "@/lib/types";

/** One of the company's projects, as shown on the home page and /projects. */
export function ProjectCard({ project }: { project: ProjectRecord }) {
  return (
    <div className="group relative flex flex-col gap-4 rounded-2xl border border-line bg-panel p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-[0_12px_40px_-12px_color-mix(in_srgb,var(--accent)_35%,transparent)]">
      <div className="flex items-center gap-3">
        <Avatar name={project.name} imageUrl={project.iconUrl} size={48} shape="square" />
        <div className="min-w-0">
          <Link
            href={`/projects/${project.id}`}
            className="block truncate text-lg font-semibold tracking-tight after:absolute after:inset-0 after:content-['']"
          >
            {project.name}
          </Link>
          {project.sourceUrl?.includes("github.com") && (
            <p className="truncate text-xs text-muted">
              {project.sourceUrl.replace(/^https?:\/\/(www\.)?github\.com\//, "")}
            </p>
          )}
        </div>
      </div>
      <p className="line-clamp-3 flex-1 text-sm leading-relaxed text-muted">
        {project.description || "No description yet."}
      </p>
      <div className="relative z-10 flex flex-wrap gap-2">
        {project.websiteUrl && (
          <a
            href={project.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="h-8 rounded-full bg-accent px-3.5 text-xs font-medium leading-8 text-on-accent transition-colors hover:bg-accent-hover"
          >
            Open ↗
          </a>
        )}
        {project.sourceUrl && (
          <a
            href={project.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="h-8 rounded-full border border-line px-3.5 text-xs font-medium leading-8 transition-colors hover:bg-foreground/[.05]"
          >
            Source
          </a>
        )}
      </div>
    </div>
  );
}
