import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserById, listFollowers } from "@/lib/store";
import { Avatar } from "@/components/Avatar";
import { displayNameOf } from "@/lib/format";

export default async function FollowersPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const user = await getUserById(userId);
  if (!user) notFound();

  const followers = await listFollowers(userId);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <Link
          href={`/profile/${userId}`}
          className="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
        >
          ← {displayNameOf(user)}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Followers</h1>
      </div>

      {followers.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No followers yet.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {followers.map((follower) => (
            <Link
              key={follower.id}
              href={`/profile/${follower.id}`}
              className="flex items-center gap-3 rounded-md p-2 transition-colors hover:bg-foreground/[.05]"
            >
              <Avatar name={displayNameOf(follower)} imageUrl={follower.imageUrl} size={40} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{displayNameOf(follower)}</span>
                {follower.displayName && <span className="block truncate text-xs text-muted">@{follower.username}</span>}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
