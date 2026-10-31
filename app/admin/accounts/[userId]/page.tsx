import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { Avatar } from "@/components/Avatar";
import { displayNameOf } from "@/lib/format";
import { getModerationStatus, getStoredUserById, isAdmin, listAccountHistory } from "@/lib/store";

const KIND_STYLE: Record<string, { label: string; className: string }> = {
  banned: { label: "Banned", className: "bg-red-500/15 text-red-500" },
  unbanned: { label: "Unbanned", className: "bg-accent/15 text-accent" },
  muted: { label: "Muted", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  unmuted: { label: "Unmuted", className: "bg-accent/15 text-accent" },
  automod: { label: "Auto mod", className: "bg-red-500/10 text-red-400" },
  report: { label: "Report", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  username_changed: { label: "Username", className: "bg-foreground/[.08] text-foreground" },
  display_name_changed: { label: "Display name", className: "bg-foreground/[.08] text-foreground" },
  picture_changed: { label: "Picture", className: "bg-foreground/[.08] text-foreground" },
  banner_changed: { label: "Banner", className: "bg-foreground/[.08] text-foreground" },
  created: { label: "Created", className: "bg-foreground/[.08] text-foreground" },
};

/** Everything that happened to one account: moderation, auto moderation, reports, name and picture changes. Jace admins only. */
export default async function AccountHistoryPage({ params }: { params: Promise<{ userId: string }> }) {
  const session = await auth();
  if (!(await isAdmin(session?.user?.id))) notFound();

  const { userId } = await params;
  const user = await getStoredUserById(userId);
  if (!user) notFound();
  const [history, status] = await Promise.all([listAccountHistory(userId), getModerationStatus(userId)]);
  const name = displayNameOf(user);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex items-center gap-4">
        <Avatar name={name} imageUrl={user.imageUrl} size={56} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-accent">Account history</p>
          <h1 className="truncate text-2xl font-semibold tracking-tight">{name}</h1>
          <p className="text-sm text-muted">
            @{user.username} · joined {new Date(user.createdAt).toLocaleDateString()}
            {status?.banned && <span className="text-red-500"> · banned now</span>}
            {status?.muted && <span className="text-amber-500"> · muted now</span>}
          </p>
        </div>
        <Link
          href={`/profile/${userId}`}
          className="h-9 shrink-0 rounded-full border border-line px-4 text-xs font-medium leading-9 transition-colors hover:bg-foreground/[.05]"
        >
          Profile
        </Link>
      </div>

      <p className="text-xs text-muted">
        Newest first. Bans and mutes by admins, apps, and Jace itself; what auto moderation blocked;
        reports about this account or its content; and name and picture changes. Name and picture
        changes are recorded from Oct 28 2026 on.
      </p>

      {history.length === 0 ? (
        <p className="text-sm text-muted">Nothing recorded yet.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {history.map((entry) => {
            const style = KIND_STYLE[entry.kind] ?? { label: entry.kind, className: "bg-foreground/[.08] text-foreground" };
            return (
              <li key={entry.id} className="flex gap-3 rounded-xl border border-line bg-panel p-3">
                <span className={`h-fit shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${style.className}`}>
                  {style.label}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm">{entry.summary}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {entry.actorId ? (
                      <Link href={`/profile/${entry.actorId}`} className="underline underline-offset-2">
                        {entry.actor}
                      </Link>
                    ) : (
                      entry.actor
                    )}{" "}
                    · {new Date(entry.createdAt).toLocaleString()}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
