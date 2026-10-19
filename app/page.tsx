import Link from "next/link";
import { auth } from "@/auth";
import { isAdmin, listCompanyProjects } from "@/lib/store";
import { ProjectCard } from "@/components/projects/ProjectCard";

const PILLARS = [
  {
    title: "One account",
    body: "Your Jace account signs you in to Jace Social, Jace Store, Jace Launcher, and everything else we make.",
  },
  {
    title: "Everything connected",
    body: "Our apps share your profile and messages, and a ban in one keeps the others safe too.",
  },
  {
    title: "Open source",
    body: "This site and most of our projects are on GitHub for anyone to read, learn from, and build on.",
  },
];

export default async function Home() {
  const session = await auth();
  const [projects, canEdit] = await Promise.all([
    listCompanyProjects(),
    isAdmin(session?.user?.id),
  ]);

  return (
    <div className="flex flex-1 flex-col">
      <section className="relative overflow-hidden">
        {/* Soft accent glow and grid behind the hero. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 [background:radial-gradient(60%_60%_at_50%_0%,color-mix(in_srgb,var(--accent)_22%,transparent),transparent_70%)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[.35] [background-image:linear-gradient(var(--line)_1px,transparent_1px),linear-gradient(90deg,var(--line)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(70%_60%_at_50%_0%,black,transparent)]"
        />
        <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-6 pb-16 pt-24 text-center sm:pt-32">
          <a
            href="https://github.com/okjace/jace"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-full border border-line bg-panel/70 px-3 py-1 text-xs font-medium text-muted backdrop-blur transition-colors hover:text-foreground"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Jace is open source on GitHub →
          </a>
          <h1 className="max-w-3xl text-5xl font-semibold leading-[1.05] tracking-tight sm:text-7xl">
            A company that{" "}
            <span className="bg-gradient-to-r from-accent to-[color-mix(in_srgb,var(--accent)_45%,#4f8fd6)] bg-clip-text text-transparent">
              makes stuff.
            </span>
          </h1>
          <p className="max-w-xl text-lg text-muted">
            Apps, games, launchers, and operating systems, all signed in with
            one Jace account.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href="#projects"
              className="h-11 rounded-full bg-accent px-6 text-sm font-medium leading-11 text-on-accent transition-colors hover:bg-accent-hover"
            >
              See what we made
            </a>
            {session?.user ? (
              <Link
                href={`/profile/${session.user.id}`}
                className="h-11 rounded-full border border-line bg-panel px-6 text-sm font-medium leading-11 transition-colors hover:bg-foreground/[.05]"
              >
                Your account
              </Link>
            ) : (
              <Link
                href="/sign-up"
                className="h-11 rounded-full border border-line bg-panel px-6 text-sm font-medium leading-11 transition-colors hover:bg-foreground/[.05]"
              >
                Create a Jace account
              </Link>
            )}
          </div>
        </div>
      </section>

      <section id="projects" className="mx-auto w-full max-w-6xl scroll-mt-24 px-6 py-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-accent">Projects</p>
            <h2 className="mt-1 text-3xl font-semibold tracking-tight">Things we made</h2>
          </div>
          {canEdit && (
            <Link
              href="/projects/new"
              className="h-9 shrink-0 rounded-full border border-line px-4 text-xs font-medium leading-9 transition-colors hover:bg-foreground/[.05]"
            >
              + Add a project
            </Link>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
        {canEdit && (
          <p className="mt-4 text-xs text-muted">
            Open a project and use &quot;Edit project&quot; to change its name,
            description, links, icon, or its order here.
          </p>
        )}
      </section>

      <section className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-4 px-6 py-10 md:grid-cols-3">
        {PILLARS.map((pillar, i) => (
          <div key={pillar.title} className="rounded-2xl border border-line bg-panel p-6">
            <p className="font-mono text-xs text-accent">0{i + 1}</p>
            <h3 className="mt-3 text-lg font-semibold">{pillar.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{pillar.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
