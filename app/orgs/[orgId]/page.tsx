import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import {
  getOrgById,
  getUserById,
  listProjects,
  listVideos,
} from "@/lib/store";
import { Avatar } from "@/components/Avatar";
import { OrgEditor } from "@/components/orgs/OrgEditor";
import { MembersPanel } from "@/components/orgs/MembersPanel";

export default async function OrgPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const session = await auth();

  const org = await getOrgById(orgId);
  if (!org) notFound();

  const isMember = !!session?.user?.id && org.memberIds.includes(session.user.id);

  const [members, projects, videos] = await Promise.all([
    Promise.all(
      org.memberIds.map(async (id) => {
        const user = await getUserById(id);
        return { id, username: user?.username ?? "unknown", imageUrl: user?.imageUrl };
      }),
    ),
    listProjects().then((all) =>
      all.filter((p) => p.ownerType === "org" && p.ownerId === orgId),
    ),
    listVideos().then((all) =>
      all.filter(
        (v) =>
          v.ownerType === "org" &&
          v.ownerId === orgId &&
          (isMember || v.visibility === "public"),
      ),
    ),
  ]);
  const isOwner = session?.user?.id === org.ownerId;
  const socialLinks = org.socialLinks ?? [];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-10">
      {org.bannerUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={org.bannerUrl}
          alt=""
          className="h-40 w-full rounded-lg object-cover"
        />
      )}
      <div className="flex items-center gap-4">
        <Avatar name={org.name} imageUrl={org.imageUrl} size={64} />
        <div>
          <h1 className="text-xl font-semibold">{org.name}</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Organization
          </p>
        </div>
      </div>

      {isMember ? (
        <OrgEditor
          orgId={org.id}
          name={org.name}
          description={org.description}
          website={org.website}
          socialLinks={socialLinks}
          imageUrl={org.imageUrl}
          isOwner={isOwner}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">
            {org.description || "No description yet."}
          </p>
          {session?.user && (
            <Link
              href={`/dms/${org.id}`}
              className="h-9 w-fit rounded-full border border-line px-4 text-xs font-medium leading-9 transition-colors hover:bg-foreground/[.05]"
            >
              Message
            </Link>
          )}
          {(org.website || socialLinks.length > 0) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {org.website && (
                <a
                  href={org.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm underline underline-offset-2"
                >
                  {org.website.replace(/^https?:\/\//, "")}
                </a>
              )}
              {socialLinks.map((link) => (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm underline underline-offset-2"
                >
                  {link.label}
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold">Members</h2>
        <MembersPanel
          orgId={org.id}
          members={members}
          ownerId={org.ownerId}
          adminIds={org.adminIds}
          isOwner={isOwner}
        />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold">Projects</h2>
        {projects.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No projects yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="flex items-center gap-3 rounded-xl border border-line bg-panel p-3 transition-colors hover:bg-foreground/[.05]"
              >
                <Avatar
                  name={project.name}
                  imageUrl={project.iconUrl}
                  size={40}
                  shape="square"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{project.name}</p>
                  <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                    {project.versions.length}{" "}
                    {project.versions.length === 1 ? "version" : "versions"}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold">Videos</h2>
        {videos.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No videos uploaded yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {videos.map((video) => (
              <Link
                key={video.id}
                href={`/videos/${video.id}`}
                className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-3"
              >
                <video
                  src={video.url}
                  poster={video.thumbnailUrl}
                  preload="metadata"
                  className="aspect-video w-full rounded-md bg-black"
                />
                <h3 className="truncate text-sm font-semibold">{video.title}</h3>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
