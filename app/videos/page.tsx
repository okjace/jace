import Link from "next/link";
import { getOwnerAvatarUrls, listPublicVideos } from "@/lib/store";
import { Avatar } from "@/components/Avatar";

export default async function VideosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const allVideos = await listPublicVideos();
  const videos = query
    ? allVideos.filter((v) =>
        `${v.title} ${v.description} ${v.ownerName}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      )
    : allVideos;

  const avatarUrls = await getOwnerAvatarUrls(
    videos.map((v) => ({ id: v.ownerId, type: v.ownerType })),
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Videos</h1>
        <div className="flex items-center gap-3">
          <form action="/videos" className="w-full sm:w-64">
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Search videos"
              className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </form>
          <Link
            href="/videos/upload"
            className="h-9 shrink-0 rounded-full bg-accent px-4 text-sm font-medium leading-9 text-on-accent transition-colors hover:bg-accent-hover"
          >
            Upload
          </Link>
        </div>
      </div>

      {videos.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {query
            ? `No videos match "${query}".`
            : "No videos yet. Be the first to upload one."}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((video) => (
            <div
              key={video.id}
              className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-3"
            >
              <video
                src={video.url}
                controls
                poster={video.thumbnailUrl}
                preload="metadata"
                className="aspect-video w-full rounded-md bg-black"
              />
              <Link href={`/videos/${video.id}`}>
                <h2 className="truncate text-sm font-semibold hover:underline">
                  {video.title}
                </h2>
              </Link>
              {video.description && (
                <p className="line-clamp-2 text-sm text-zinc-500 dark:text-zinc-400">
                  {video.description}
                </p>
              )}
              <Link
                href={
                  video.ownerType === "org"
                    ? `/orgs/${video.ownerId}`
                    : `/profile/${video.ownerId}`
                }
                className="mt-1 flex items-center gap-2 text-xs text-zinc-500 hover:underline dark:text-zinc-400"
              >
                <Avatar
                  name={video.ownerName}
                  imageUrl={avatarUrls.get(video.ownerId)}
                  size={20}
                />
                {video.ownerName}
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
