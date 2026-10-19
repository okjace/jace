import Link from "next/link";
import { auth } from "@/auth";
import { listUsers } from "@/lib/store";
import { Avatar } from "@/components/Avatar";

export default async function ProfileDirectoryPage() {
  const session = await auth();
  const users = await listUsers();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
      <h1 className="text-2xl font-semibold">Profiles</h1>

      {session?.user && (
        <Link
          href={`/profile/${session.user.id}`}
          className="w-fit rounded-full bg-accent px-4 py-2 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover"
        >
          View your profile
        </Link>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {users.map((user) => (
          <Link
            key={user.id}
            href={`/profile/${user.id}`}
            className="flex items-center gap-3 rounded-xl border border-line bg-panel p-3 transition-colors hover:bg-foreground/[.05]"
          >
            <Avatar name={user.username} imageUrl={user.imageUrl} size={40} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {user.username}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
