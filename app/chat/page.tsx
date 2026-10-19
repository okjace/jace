import { auth } from "@/auth";
import { PUBLIC_CALL_ID } from "@/lib/callId";
import { listActingOrgs } from "@/lib/permissions";
import { getUserById, isAdmin, listChatMessages } from "@/lib/store";
import { CallButton } from "@/components/calls/CallButton";
import { ChatRoom } from "@/components/chat/ChatRoom";

export default async function ChatPage() {
  const session = await auth();
  const [messages, currentUser, admin, actingOrgs] = await Promise.all([
    listChatMessages(),
    session?.user?.id ? getUserById(session.user.id) : null,
    isAdmin(session?.user?.id),
    session?.user?.id ? listActingOrgs(session.user.id) : [],
  ]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Live chat</h1>
        {session?.user?.id && (
          <CallButton
            roomName={PUBLIC_CALL_ID}
            currentUserName={session.user.name ?? "Anonymous"}
            label="Join voice chat"
          />
        )}
      </div>
      <ChatRoom
        initialMessages={messages}
        currentUserId={session?.user?.id ?? null}
        currentUserName={session?.user?.name ?? null}
        currentUserImageUrl={currentUser?.imageUrl}
        canModerate={admin}
        orgs={actingOrgs.map((o) => ({ id: o.id, name: o.name, imageUrl: o.imageUrl }))}
      />
    </div>
  );
}
