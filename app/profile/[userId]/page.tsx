import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { isRootAdmin } from "@/lib/constants";
import { readSavedAccounts } from "@/lib/accountSwitcher";
import { listGrantsForUser, listOAuthAppsForUser } from "@/lib/oauth";
import {
  getAccountDetails,
  getAvatarUrlsByIds,
  getFollowCounts,
  getModerationStatus,
  getUserById,
  isAdmin,
  isFollowing,
  listAppModerationLog,
  listGrantedAdmins,
} from "@/lib/store";
import { Avatar } from "@/components/Avatar";
import { displayNameOf } from "@/lib/format";
import { getAutomodSettings, listAutomodLog } from "@/lib/automod";
import { FollowButton } from "@/components/profile/FollowButton";
import { ReportButton } from "@/components/reports/ReportButton";
import { ModerationPanel } from "@/components/profile/ModerationPanel";
import { ProfileEditor, type AccountTab } from "@/components/profile/ProfileEditor";

const ACCOUNT_TABS: AccountTab[] = ["profile", "account", "security", "appearance", "apps", "developer", "data", "moderation", "admin"];

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { userId } = await params;
  const { tab } = await searchParams;
  const initialTab = ACCOUNT_TABS.find((t) => t === tab);
  const session = await auth();
  const isOwnProfile = session?.user?.id === userId;

  const user = await getUserById(userId);
  if (!user) notFound();

  const [followCounts, viewerIsFollowing] = await Promise.all([
    getFollowCounts(userId),
    session?.user?.id && session.user.id !== userId
      ? isFollowing(session.user.id, userId)
      : Promise.resolve(false),
  ]);

  const socialLinks = user.socialLinks ?? [];
  const account = isOwnProfile ? await getAccountDetails(userId) : null;

  const otherSavedAccounts = isOwnProfile
    ? (await readSavedAccounts()).filter((a) => a.id !== userId)
    : [];
  const savedAccountAvatars = isOwnProfile
    ? await getAvatarUrlsByIds(otherSavedAccounts.map((a) => a.id))
    : new Map<string, string | undefined>();
  const savedAccounts = otherSavedAccounts.map((a) => ({
    id: a.id,
    username: a.username,
    imageUrl: savedAccountAvatars.get(a.id),
  }));

  const oauthGrants = isOwnProfile ? await listGrantsForUser(userId) : [];
  const oauthApps = isOwnProfile ? await listOAuthAppsForUser(userId) : [];

  const showAdminPanel = isOwnProfile && isRootAdmin(userId);
  const admins = showAdminPanel ? await listGrantedAdmins() : [];
  const moderationLog = showAdminPanel ? await listAppModerationLog() : [];
  const automod =
    isOwnProfile && (await isAdmin(userId))
      ? { settings: await getAutomodSettings(true), log: await listAutomodLog() }
      : undefined;
  const viewerIsAdmin = !isOwnProfile && (await isAdmin(session?.user?.id));
  const targetStatus = await getModerationStatus(userId);
  const moderationStatus = viewerIsAdmin ? targetStatus : null;
  // Banned/muted accounts show a label instead of their bio and links — hidden, not erased, so unbanning restores them.
  const restrictedLabel = isOwnProfile
    ? null
    : targetStatus?.banned
      ? "THIS IS A BANNED USER"
      : targetStatus?.muted
        ? "THIS IS A MUTED USER"
        : null;

  // A muted or banned account's display name is hidden like its bio; others see the username.
  const shownName = restrictedLabel ? user.username : displayNameOf(user);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-10">
      <div className="overflow-hidden rounded-2xl border border-line bg-panel">
        {user.bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.bannerUrl} alt="" className="h-40 w-full object-cover" />
        ) : (
          <div className="h-28 w-full [background:linear-gradient(120deg,color-mix(in_srgb,var(--accent)_45%,transparent),color-mix(in_srgb,#4f8fd6_35%,transparent))]" />
        )}
        <div className="flex flex-wrap items-end gap-4 px-6 pb-5">
          <div className="-mt-10 rounded-full border-4 border-panel">
            <Avatar name={shownName} imageUrl={user.imageUrl} size={80} />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">{shownName}</h1>
            {shownName !== user.username && <p className="text-sm text-muted">@{user.username}</p>}
            <div className="mt-1 flex gap-3 text-sm text-muted">
              <Link href={`/profile/${userId}/followers`} className="hover:underline">
                <span className="font-medium text-foreground">{followCounts.followers}</span> followers
              </Link>
              <Link href={`/profile/${userId}/following`} className="hover:underline">
                <span className="font-medium text-foreground">{followCounts.following}</span> following
              </Link>
            </div>
          </div>
          {!isOwnProfile && session?.user?.id && (
            <FollowButton targetUserId={userId} initialFollowing={viewerIsFollowing} />
          )}
        </div>
      </div>

      {isOwnProfile ? (
        <ProfileEditor
          userId={userId}
          username={user.username}
          displayName={user.displayName}
          bio={user.bio}
          website={user.website}
          socialLinks={socialLinks}
          imageUrl={user.imageUrl}
          bannerUrl={user.bannerUrl}
          defaultVideoTitle={user.defaultVideoTitle}
          defaultVideoDescription={user.defaultVideoDescription}
          account={account}
          showAdminPanel={showAdminPanel}
          admins={admins}
          restricted={!!(targetStatus?.banned || targetStatus?.muted)}
          savedAccounts={savedAccounts}
          oauthGrants={oauthGrants}
          oauthApps={oauthApps}
          moderationLog={moderationLog}
          initialTab={initialTab}
          automod={automod}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {restrictedLabel ? (
            <p className="text-sm font-bold tracking-wide text-red-500">{restrictedLabel}</p>
          ) : (
            <p className="whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">
              {user.bio || "No bio yet."}
            </p>
          )}
          {!restrictedLabel && (user.website || socialLinks.length > 0) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {user.website && (
                <a
                  href={user.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm underline underline-offset-2"
                >
                  {user.website.replace(/^https?:\/\//, "")}
                </a>
              )}
              {socialLinks.map((link) => (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm underline underline-offset-2"
                >
                  {link.label}
                </a>
              ))}
            </div>
          )}
          <ReportButton targetType="user" targetId={userId} label="Report this account" />
          {moderationStatus && <ModerationPanel userId={userId} status={moderationStatus} />}
        </div>
      )}

    </div>
  );
}
