import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getForumById, getOwnerAvatarUrls, getTopicById, isAdmin } from "@/lib/store";
import { isAuthorOrOrgStaff, listActingOrgs } from "@/lib/permissions";
import { README_FORUM_ID } from "@/lib/constants";
import { Avatar } from "@/components/Avatar";
import { AttachmentPreview } from "@/components/AttachmentPreview";
import { MarkdownContent } from "@/components/forums/MarkdownContent";
import { ReportButton } from "@/components/reports/ReportButton";
import { ReplyForm } from "@/components/forums/ReplyForm";
import { ReplyItem } from "@/components/forums/ReplyItem";
import { TopicEditor } from "@/components/forums/TopicEditor";

export default async function TopicPage({
  params,
}: {
  params: Promise<{ forumId: string; topicId: string }>;
}) {
  const { forumId, topicId } = await params;
  const session = await auth();
  const admin = await isAdmin(session?.user?.id);

  const forum = await getForumById(forumId);
  if (!forum) notFound();
  if (forum.viewPermission === "adminOnly" && !admin) notFound();

  const topic = await getTopicById(topicId);
  if (!topic || topic.forumId !== forumId) notFound();

  // The READ ME forum is a one-way notice board — only the main post shows,
  // no replies or reply box, even for admins (see `ReadmePopup`).
  const isReadOnly = forumId === README_FORUM_ID;

  const canPost =
    !isReadOnly && !!session?.user?.id && (forum.replyPermission === "everyone" || admin);
  const viewerId = session?.user?.id;
  const canManageTopic =
    !!viewerId && (admin || (await isAuthorOrOrgStaff(topic, viewerId)));
  const replyManage = await Promise.all(
    topic.replies.map(async (r) => !!viewerId && (admin || (await isAuthorOrOrgStaff(r, viewerId)))),
  );
  const actingOrgs = canPost && viewerId ? await listActingOrgs(viewerId) : [];
  const avatarUrls = await getOwnerAvatarUrls(
    [topic, ...topic.replies].map((c) => ({ id: c.authorId, type: c.authorType ?? "user" })),
  );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <Link
        href={`/forums/${forumId}`}
        className="w-fit text-sm text-zinc-500 hover:underline dark:text-zinc-400"
      >
        ← {forum.name}
      </Link>

      <div className="flex flex-col gap-2">
        {canManageTopic ? (
          <TopicEditor
            forumId={forumId}
            topicId={topicId}
            title={topic.title}
            body={topic.body}
          />
        ) : (
          <h1 className="text-2xl font-semibold">{topic.title}</h1>
        )}
        <Link
          href={topic.authorType === "org" ? `/orgs/${topic.authorId}` : `/profile/${topic.authorId}`}
          className="flex w-fit items-center gap-2 text-sm text-zinc-500 hover:underline dark:text-zinc-400"
        >
          <Avatar
            name={topic.authorName}
            imageUrl={avatarUrls.get(topic.authorId)}
            size={20}
          />
          {topic.authorName}
        </Link>
        {!canManageTopic && (
          <ReportButton targetType="forum_topic" targetId={topic.id} label="Report topic" />
        )}
      </div>

      {!canManageTopic && topic.body && <MarkdownContent>{topic.body}</MarkdownContent>}
      {topic.attachment && <AttachmentPreview attachment={topic.attachment} />}

      {!isReadOnly && topic.replies.length > 0 && (
        <div className="flex flex-col gap-4 border-t border-line pt-6">
          {topic.replies.map((reply, i) => (
            <ReplyItem
              key={reply.id}
              forumId={forumId}
              topicId={topicId}
              replyId={reply.id}
              authorId={reply.authorId}
              authorType={reply.authorType ?? "user"}
              authorName={reply.authorName}
              authorImageUrl={avatarUrls.get(reply.authorId)}
              body={reply.body}
              attachment={reply.attachment}
              canManage={replyManage[i]}
              canReport={!replyManage[i]}
            />
          ))}
        </div>
      )}

      {!isReadOnly && (
        <div className="border-t border-line pt-6">
          {canPost ? (
            <ReplyForm
              forumId={forumId}
              topicId={topicId}
              initialReplyCount={topic.replies.length}
              orgs={actingOrgs.map((o) => ({ id: o.id, name: o.name }))}
            />
          ) : session?.user ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Only the site admin can post in this forum.
            </p>
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              <Link href="/sign-in" className="underline underline-offset-2">
                Sign in
              </Link>{" "}
              to reply.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
