import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { dmCallId } from "@/lib/callId";
import { listActingOrgs, resolveDmActor } from "@/lib/permissions";
import { SUPPORT_ORG_ID } from "@/lib/constants";
import {
  dmConversationId,
  getMessageParty,
  getModerationStatus,
  listDmMessages,
  restrictedDmNotice,
} from "@/lib/store";
import { Avatar } from "@/components/Avatar";
import { CallButton } from "@/components/calls/CallButton";
import { DmThread } from "@/components/dms/DmThread";
import { SendAsToggle } from "@/components/dms/SendAsToggle";

export default async function DmConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ as?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const { userId: otherId } = await params;
  const { as: asOrgId } = await searchParams;

  const actor = await resolveDmActor(
    session.user.id,
    session.user.name, asOrgId);
  if (!actor) notFound();
  if (otherId === actor.id) notFound();

  const [otherUser, currentUser, actingOrgs] = await Promise.all([
    getMessageParty(otherId),
    getMessageParty(actor.id),
    listActingOrgs(session.user.id),
  ]);
  if (!otherUser) notFound();

  // Tell the viewer why a muted/banned person's messages aren't showing (not in the appeal thread with the support org).
  const otherStatus =
    otherUser.type === "user" && actor.id !== SUPPORT_ORG_ID ? await getModerationStatus(otherId) : null;
  const notice = otherStatus?.banned || otherStatus?.muted ? restrictedDmNotice(!!otherStatus.banned) : null;

  const conversationId = dmConversationId(actor.id, otherId);
  const messages = await listDmMessages(conversationId);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex items-center gap-3">
        <Link
          href="/dms"
          className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
        >
          &larr; Messages
        </Link>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar name={otherUser.name} imageUrl={otherUser.imageUrl} size={40} />
          <Link
            href={otherUser.type === "org" ? `/orgs/${otherId}` : `/profile/${otherId}`}
            className="text-lg font-semibold hover:underline"
          >
            {otherUser.name}
          </Link>
          {actor.type === "org" && (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Messaging as {actor.name}
            </span>
          )}
        </div>
        {actor.type === "user" && otherUser.type === "user" && (
          <CallButton
            roomName={dmCallId(session.user.id, otherId)}
            currentUserName={session.user.name ?? "Anonymous"}
            label={`Call ${otherUser.name}`}
            notify={{ type: "dm", otherId }}
          />
        )}
      </div>
      {notice && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-700 dark:text-amber-400">
          {notice}
        </p>
      )}
      <SendAsToggle
        otherId={otherId}
        currentId={actor.id}
        userId={session.user.id}
        userName={session.user.name ?? "Anonymous"}
        orgs={actingOrgs.map((o) => ({ id: o.id, name: o.name }))}
      />
      <DmThread
        otherId={otherId}
        otherName={otherUser.name}
        otherImageUrl={otherUser.imageUrl}
        initialMessages={messages}
        currentUserId={actor.id}
        currentUserName={actor.name}
        currentUserImageUrl={currentUser?.imageUrl}
        asOrgId={actor.type === "org" ? actor.id : undefined}
      />
    </div>
  );
}
