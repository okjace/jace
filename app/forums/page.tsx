import Link from "next/link";
import { auth } from "@/auth";
import { isAdmin, listForums, listTopicsByForum } from "@/lib/store";

export default async function ForumsPage() {
  const session = await auth();
  const admin = await isAdmin(session?.user?.id);

  const allForums = await listForums();
  const visibleForums = allForums.filter(
    (f) => f.viewPermission === "everyone" || admin,
  );

  const counts = await Promise.all(
    visibleForums.map((f) => listTopicsByForum(f.id).then((t) => t.length)),
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Forums</h1>
        {admin && (
          <Link
            href="/forums/new"
            className="h-10 rounded-full bg-accent px-4 text-sm font-medium leading-10 text-on-accent transition-colors hover:bg-accent-hover"
          >
            New forum
          </Link>
        )}
      </div>

      {visibleForums.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No forums yet.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {visibleForums.map((forum, i) => (
            <Link
              key={forum.id}
              href={`/forums/${forum.id}`}
              className="flex flex-col gap-1 rounded-lg border border-black/10 p-4 transition-colors hover:bg-black/[.03] dark:border-white/15 dark:hover:bg-white/[.05]"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">{forum.name}</h2>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {counts[i]} {counts[i] === 1 ? "topic" : "topics"}
                </span>
              </div>
              {forum.description && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {forum.description}
                </p>
              )}
              {(forum.postPermission === "adminOnly" ||
                forum.replyPermission === "adminOnly" ||
                forum.viewPermission === "adminOnly") && (
                <div className="mt-1 flex flex-wrap gap-2">
                  {forum.postPermission === "adminOnly" && (
                    <span className="w-fit rounded-full bg-black/10 px-2 py-0.5 text-xs dark:bg-white/10">
                      Admin-only topics
                    </span>
                  )}
                  {forum.replyPermission === "adminOnly" && (
                    <span className="w-fit rounded-full bg-black/10 px-2 py-0.5 text-xs dark:bg-white/10">
                      Admin-only replies
                    </span>
                  )}
                  {forum.viewPermission === "adminOnly" && (
                    <span className="w-fit rounded-full bg-black/10 px-2 py-0.5 text-xs dark:bg-white/10">
                      Admin only
                    </span>
                  )}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
