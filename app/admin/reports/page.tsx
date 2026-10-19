import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { isAdmin, listReports } from "@/lib/store";
import { ReportActions } from "@/components/reports/ReportActions";

const REASON_LABEL: Record<string, string> = {
  spam: "Spam",
  harassment: "Harassment or abuse",
  inappropriate: "Inappropriate content",
  other: "Other",
};
const TYPE_LABEL: Record<string, string> = {
  user: "Account",
  video: "Video",
  video_comment: "Video comment",
  forum_topic: "Forum topic",
  forum_reply: "Forum reply",
  chat_message: "Chat message",
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await auth();
  if (!(await isAdmin(session?.user?.id))) notFound();

  const { status } = await searchParams;
  const closed = status === "closed";
  const reports = await listReports(closed ? "closed" : "open");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Reports</h1>
        <div className="flex gap-3 text-sm">
          <Link href="/admin/reports" className={closed ? "text-zinc-500" : "font-semibold underline"}>
            Open
          </Link>
          <Link
            href="/admin/reports?status=closed"
            className={closed ? "font-semibold underline" : "text-zinc-500"}
          >
            Closed
          </Link>
        </div>
      </div>

      {reports.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {closed ? "No closed reports yet." : "No open reports. Nice."}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {reports.map((r) => (
            <div key={r.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-panel p-5">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-red-500/15 px-2 py-0.5 font-medium text-red-600 dark:text-red-400">
                  {REASON_LABEL[r.reason]}
                </span>
                <span className="rounded-full border border-line px-2 py-0.5">
                  {TYPE_LABEL[r.targetType]}
                </span>
                <span className="text-zinc-500 dark:text-zinc-400">
                  {new Date(r.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="text-sm">
                <span className="font-medium">
                  {r.ownerType === "org" ? (
                    <Link href={`/orgs/${r.ownerId}`} className="underline underline-offset-2">
                      {r.ownerName}
                    </Link>
                  ) : (
                    <Link href={`/profile/${r.ownerId}`} className="underline underline-offset-2">
                      {r.ownerName}
                    </Link>
                  )}
                </span>{" "}
                <span className="text-zinc-500 dark:text-zinc-400">
                  — reported by{" "}
                  {r.reporterId.startsWith("anon:") ? (
                    "an anonymous visitor"
                  ) : (
                    <Link href={`/profile/${r.reporterId}`} className="underline underline-offset-2">
                      {r.reporterName}
                    </Link>
                  )}
                </span>
              </p>
              <blockquote className="border-l-2 border-black/15 pl-3 text-sm text-zinc-600 dark:border-white/20 dark:text-zinc-400">
                {r.excerpt}
              </blockquote>
              {r.details && <p className="text-sm">“{r.details}”</p>}
              <div className="flex gap-4 text-xs">
                <Link href={r.url} className="font-medium underline underline-offset-2">
                  View content
                </Link>
                {r.ownerType === "user" && (
                  <Link href={`/profile/${r.ownerId}`} className="font-medium underline underline-offset-2">
                    Moderate account
                  </Link>
                )}
              </div>
              {r.status === "open" ? (
                <ReportActions reportId={r.id} />
              ) : (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {r.status === "resolved" ? "Resolved" : "Dismissed"} by {r.resolvedByName}
                  {r.resolutionNote ? ` — ${r.resolutionNote}` : ""}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
