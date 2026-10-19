import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import {
  getOwnerAvatarUrls,
  getForumById,
  isAdmin,
  listTopicsByForum,
} from "@/lib/store";
import { Avatar } from "@/components/Avatar";
import { ForumSettingsPanel } from "@/components/forums/ForumSettingsPanel";
import { ReadmePushButton } from "@/components/forums/ReadmePushButton";
import { README_FORUM_ID } from "@/lib/constants";

const TOPICS_PER_PAGE = 15;

export default async function ForumPage({
  params,
  searchParams,
}: {
  params: Promise<{ forumId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { forumId } = await params;
  const { page: pageParam } = await searchParams;
  const session = await auth();
  const admin = await isAdmin(session?.user?.id);

  const forum = await getForumById(forumId);
  if (!forum) notFound();
  if (forum.viewPermission === "adminOnly" && !admin) notFound();

  const allTopics = await listTopicsByForum(forumId);
  const pageCount = Math.max(1, Math.ceil(allTopics.length / TOPICS_PER_PAGE));
  const page = Math.min(Math.max(1, Number(pageParam) || 1), pageCount);
  const topics = allTopics.slice((page - 1) * TOPICS_PER_PAGE, page * TOPICS_PER_PAGE);

  const avatarUrls = await getOwnerAvatarUrls(
    topics.map((t) => ({ id: t.authorId, type: t.authorType ?? "user" })),
  );
  const canPost =
    !!session?.user?.id && (forum.postPermission === "everyone" || admin);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{forum.name}</h1>
          {forum.description && (
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {forum.description}
            </p>
          )}
        </div>
        {canPost && (
          <Link
            href={`/forums/${forumId}/new`}
            className="h-10 shrink-0 rounded-full bg-accent px-4 text-sm font-medium leading-10 text-on-accent transition-colors hover:bg-accent-hover"
          >
            New topic
          </Link>
        )}
      </div>

      {admin && (
        <ForumSettingsPanel
          forumId={forum.id}
          postPermission={forum.postPermission}
          replyPermission={forum.replyPermission}
          viewPermission={forum.viewPermission}
        />
      )}

      {admin && forumId === README_FORUM_ID && <ReadmePushButton />}

      {!canPost && session?.user?.id && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Only the site admin can post in this forum.
        </p>
      )}

      {topics.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No topics yet.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {topics.map((topic) => (
            <Link
              key={topic.id}
              href={`/forums/${forumId}/${topic.id}`}
              className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-panel p-5 transition-colors hover:bg-foreground/[.05]"
            >
              <div className="min-w-0">
                <h2 className="truncate font-semibold">{topic.title}</h2>
                <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <Avatar
                    name={topic.authorName}
                    imageUrl={avatarUrls.get(topic.authorId)}
                    size={16}
                  />
                  {topic.authorName}
                </div>
              </div>
              <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                {topic.replies.length}{" "}
                {topic.replies.length === 1 ? "reply" : "replies"}
              </span>
            </Link>
          ))}
        </div>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-between gap-3 pt-2 text-sm">
          {page > 1 ? (
            <Link
              href={`/forums/${forumId}?page=${page - 1}`}
              className="rounded-full border border-line px-4 py-1.5 font-medium transition-colors hover:bg-foreground/[.05]"
            >
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Page {page} of {pageCount}
          </span>
          {page < pageCount ? (
            <Link
              href={`/forums/${forumId}?page=${page + 1}`}
              className="rounded-full border border-line px-4 py-1.5 font-medium transition-colors hover:bg-foreground/[.05]"
            >
              Older →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}
