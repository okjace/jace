import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { groupCallId } from "@/lib/callId";
import { getGroupChat, getUserById, listGroupChatMessages } from "@/lib/store";
import { CallButton } from "@/components/calls/CallButton";
import { GroupChatThread } from "@/components/groups/GroupChatThread";
import { AddMemberForm } from "@/components/groups/AddMemberForm";
import { LeaveGroupButton } from "@/components/groups/LeaveGroupButton";

export default async function GroupChatPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const { groupId } = await params;
  const group = await getGroupChat(groupId);
  if (!group || !group.memberIds.includes(session.user.id)) notFound();

  const [messages, members] = await Promise.all([
    listGroupChatMessages(groupId),
    Promise.all(group.memberIds.map((id) => getUserById(id))),
  ]);
  const memberNames = members.filter((m) => m !== null).map((m) => m.username);
  const memberImageUrls: Record<string, string | undefined> = {};
  group.memberIds.forEach((id, i) => {
    memberImageUrls[id] = members[i]?.imageUrl;
  });

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

      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">{group.name}</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {memberNames.join(", ")}
          </p>
        </div>
        <CallButton
          roomName={groupCallId(groupId)}
          currentUserName={session.user.name ?? "Anonymous"}
          notify={{ type: "group", groupId }}
        />
      </div>

      <GroupChatThread
        groupId={groupId}
        initialMessages={messages}
        currentUserId={session.user.id}
        currentUserName={session.user.name ?? "Anonymous"}
        memberImageUrls={memberImageUrls}
      />

      <div className="flex flex-col gap-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
        <h2 className="text-sm font-semibold">Members</h2>
        <AddMemberForm groupId={groupId} />
        <LeaveGroupButton groupId={groupId} />
      </div>
    </div>
  );
}
