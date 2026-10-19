import Link from "next/link";
import { listOrgs } from "@/lib/store";
import { Avatar } from "@/components/Avatar";

export default async function OrgsPage() {
  const orgs = await listOrgs();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Organizations</h1>
        <Link
          href="/orgs/new"
          className="h-10 rounded-full bg-accent px-4 text-sm font-medium leading-10 text-on-accent transition-colors hover:bg-accent-hover"
        >
          New organization
        </Link>
      </div>

      {orgs.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No organizations yet. Create one to work as a team.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {orgs.map((org) => (
            <Link
              key={org.id}
              href={`/orgs/${org.id}`}
              className="flex items-center gap-3 rounded-xl border border-line bg-panel p-3 transition-colors hover:bg-foreground/[.05]"
            >
              <Avatar name={org.name} imageUrl={org.imageUrl} size={48} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{org.name}</p>
                <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {org.memberIds.length}{" "}
                  {org.memberIds.length === 1 ? "member" : "members"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
