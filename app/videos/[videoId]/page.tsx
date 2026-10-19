import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import {
  getAvatarUrlsByIds,
  getOwnerAvatarUrls,
  getVideoById,
  getVideoLikeInfo,
  listPublicVideos,
} from "@/lib/store";
import { canManageOwned, canViewVideo } from "@/lib/permissions";
import { Avatar } from "@/components/Avatar";
import { Comments } from "@/components/Comments";
import { VideoEditor } from "@/components/videos/VideoEditor";
import { ReportButton } from "@/components/reports/ReportButton";
import { LikeButton } from "@/components/videos/LikeButton";
import {
  addVideoCommentAction,
  deleteVideoCommentAction,
  setVideoCommentPinnedAction,
} from "./actions";

const RECOMMENDED_COUNT = 12;

export default async function VideoPage({
  params,
}: {
  params: Promise<{ videoId: string }>;
}) {
  const { videoId } = await params;
  const session = await auth();

  const video = await getVideoById(videoId);
  if (!video) notFound();
  if (!(await canViewVideo(video, session?.user?.id))) notFound();

  const canManage = !!session?.user?.id && (await canManageOwned(video, session.user.id));

  const ownerHref =
    video.ownerType === "org" ? `/orgs/${video.ownerId}` : `/profile/${video.ownerId}`;

  const publicVideos = await listPublicVideos();
  const recommended = publicVideos
    .filter((v) => v.id !== video.id)
    .slice(0, RECOMMENDED_COUNT);

  const [avatarUrls, commentAuthorUrls, likeInfo] = await Promise.all([
    getOwnerAvatarUrls([
      { id: video.ownerId, type: video.ownerType },
      ...recommended.map((v) => ({ id: v.ownerId, type: v.ownerType })),
    ]),
    getAvatarUrlsByIds(video.comments.map((c) => c.authorId)),
    getVideoLikeInfo(video.id, session?.user?.id),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-10 lg:flex-row lg:items-start">
      <div className="flex w-full max-w-2xl flex-col gap-4">
        <video
          src={video.url}
          controls
          poster={video.thumbnailUrl}
          preload="metadata"
          className="aspect-video w-full rounded-lg bg-black"
        />
        <h1 className="text-xl font-semibold">{video.title}</h1>
        <Link
          href={ownerHref}
          className="flex w-fit items-center gap-2 text-sm text-zinc-500 hover:underline dark:text-zinc-400"
        >
          <Avatar
            name={video.ownerName}
            imageUrl={avatarUrls.get(video.ownerId)}
            size={20}
          />
          {video.ownerName}
        </Link>

        <LikeButton
          videoId={video.id}
          initialCount={likeInfo.count}
          initialLiked={likeInfo.likedByMe}
          signedIn={!!session?.user?.id}
        />

        {!canManage && <ReportButton targetType="video" targetId={video.id} label="Report video" />}

        {canManage ? (
          <VideoEditor
            videoId={video.id}
            title={video.title}
            description={video.description}
            thumbnailUrl={video.thumbnailUrl}
            visibility={video.visibility}
          />
        ) : (
          video.description && (
            <p className="whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">
              {video.description}
            </p>
          )
        )}

        <Comments
          comments={video.comments}
          avatarUrls={commentAuthorUrls}
          currentUserId={session?.user?.id}
          canModerate={canManage}
          addAction={addVideoCommentAction.bind(null, video.id)}
          deleteAction={deleteVideoCommentAction.bind(null, video.id)}
          attachmentPathPrefix={`videos/${video.id}/comments`}
          onTogglePin={setVideoCommentPinnedAction.bind(null, video.id)}
          reportType="video_comment"
          reportParentId={video.id}
        />
      </div>

      {recommended.length > 0 && (
        <div className="flex w-full flex-col gap-3 lg:max-w-xs">
          <h2 className="text-sm font-semibold">Recommended</h2>
          <div className="flex flex-col gap-3">
            {recommended.map((rec) => (
              <Link
                key={rec.id}
                href={`/videos/${rec.id}`}
                className="flex gap-3 rounded-md p-1.5 transition-colors hover:bg-black/[.03] dark:hover:bg-white/[.05]"
              >
                <span className="relative aspect-video w-36 shrink-0 overflow-hidden rounded-md bg-black">
                  {rec.thumbnailUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={rec.thumbnailUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium">
                    {rec.title}
                  </p>
                  <div className="mt-1 flex items-center gap-1.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                    <Avatar
                      name={rec.ownerName}
                      imageUrl={avatarUrls.get(rec.ownerId)}
                      size={14}
                    />
                    {rec.ownerName}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
