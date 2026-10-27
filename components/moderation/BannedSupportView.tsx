import { SUPPORT_ORG_ID } from "@/lib/constants";
import { dmConversationId, getMessageParty, listDmMessages } from "@/lib/store";
import { DmThread } from "@/components/dms/DmThread";
import { SignOutButton } from "@/components/auth/SignOutButton";

/** All a banned user sees: why they're banned, and a thread with the support org to appeal. */
export async function BannedSupportView({
  userId,
  userName,
  userImageUrl,
  banReason,
  banUntil,
  appealable = true,
  canSignOut = true,
}: {
  userId: string;
  userName: string;
  userImageUrl?: string;
  banReason?: string;
  /** When the ban ends on its own; absent = permanent. */
  banUntil?: string;
  /** False when the ban was set with appeals turned off (the API refuses the message too). */
  appealable?: boolean;
  /** False hides the Sign out button. */
  canSignOut?: boolean;
}) {
  const org = appealable ? await getMessageParty(SUPPORT_ORG_ID) : null;
  const messages = org ? await listDmMessages(dmConversationId(userId, SUPPORT_ORG_ID)) : [];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-start gap-4 px-6 py-10">
      <h1 className="text-xl font-semibold text-red-500">Your account has been banned</h1>
      {banReason && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Reason: {banReason}</p>
      )}
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {banUntil
          ? `The ban ends on ${new Date(banUntil).toUTCString()}. This page will update by itself when it does.`
          : "This ban is permanent."}
      </p>
      {!appealable && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Appeals aren&apos;t available for this ban.</p>
      )}
      {org && (
        <div className="flex w-full flex-col gap-3">
          <h2 className="text-sm font-semibold">Message {org.name} to appeal</h2>
          <DmThread
            otherId={org.id}
            otherName={org.name}
            otherImageUrl={org.imageUrl}
            initialMessages={messages}
            currentUserId={userId}
            currentUserName={userName}
            currentUserImageUrl={userImageUrl}
          />
        </div>
      )}
      {canSignOut && <SignOutButton />}
    </div>
  );
}
