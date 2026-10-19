import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listActingOrgs } from "@/lib/permissions";
import {
  getAvatarUrlsByIds,
  getOwnerAvatarUrls,
  lastGroupChatMessages,
  listDmConversations,
  listGroupChatsForUser,
} from "@/lib/store";
import { Avatar } from "@/components/Avatar";
import { NewConversationForm } from "@/components/dms/NewConversationForm";
import { NewGroupForm } from "@/components/groups/NewGroupForm";

export default async function DmsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const currentUserId = session.user.id;
  const [conversations, groups, groupLastMessages] = await Promise.all([
    listDmConversations(currentUserId),
    listGroupChatsForUser(currentUserId),
    lastGroupChatMessages(),
  ]);

  const actingOrgs = await listActingOrgs(currentUserId);
  const orgConversations = await Promise.all(
    actingOrgs.map(async (org) => ({ org, conversations: await listDmConversations(org.id) })),
  );

  // Conversation partners can be users or orgs, so look each id up as both.
  const partnerIds = [
    ...conversations,
    ...orgConversations.flatMap((o) => o.conversations),
  ].map((c) => c.otherId);
  const [userAvatars, orgAvatars] = await Promise.all([
    getAvatarUrlsByIds(partnerIds),
    getOwnerAvatarUrls(partnerIds.map((id) => ({ id, type: "org" as const }))),
  ]);
  const avatarUrls = new Map([...orgAvatars, ...userAvatars]);

  const groupRows = groups
    .map((g) => ({ group: g, lastMessage: groupLastMessages.get(g.id) }))
    .sort((a, b) => {
      const aTime = a.lastMessage?.createdAt ?? a.group.createdAt;
      const bTime = b.lastMessage?.createdAt ?? b.group.createdAt;
      return aTime < bTime ? 1 : -1;
    });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-10">
      <h1 className="text-2xl font-semibold">Messages</h1>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Direct messages</h2>
        </div>
        <NewConversationForm />
        {conversations.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No conversations yet. Start one above, or message someone from
            their profile.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {conversations.map((c) => (
              <Link
                key={c.otherId}
                href={`/dms/${c.otherId}`}
                className="flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-black/[.03] dark:hover:bg-white/[.05]"
              >
                <Avatar name={c.otherName} imageUrl={avatarUrls.get(c.otherId)} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{c.otherName}</p>
                    <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                      {new Date(c.lastMessage.createdAt).toLocaleDateString([], {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                  <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">
                    {c.lastMessage.fromId === currentUserId ? "You: " : ""}
                    {c.lastMessage.body}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {orgConversations.map(({ org, conversations: orgConvos }) => (
        <div key={org.id} className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Messages as {org.name}</h2>
          <NewConversationForm asOrgId={org.id} />
          {orgConvos.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No conversations yet. People can message {org.name} from its page.
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {orgConvos.map((c) => (
                <Link
                  key={c.otherId}
                  href={`/dms/${c.otherId}?as=${org.id}`}
                  className="flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-black/[.03] dark:hover:bg-white/[.05]"
                >
                  <Avatar name={c.otherName} imageUrl={avatarUrls.get(c.otherId)} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{c.otherName}</p>
                    <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">
                      {c.lastMessage.fromId === org.id ? `${org.name}: ` : ""}
                      {c.lastMessage.body}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      ))}

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Group chats</h2>
        <NewGroupForm />
        {groupRows.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No group chats yet. Create one above.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {groupRows.map(({ group, lastMessage }) => (
              <Link
                key={group.id}
                href={`/groups/${group.id}`}
                className="flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-black/[.03] dark:hover:bg-white/[.05]"
              >
                <Avatar name={group.name} size={40} shape="square" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{group.name}</p>
                    {lastMessage && (
                      <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                        {new Date(lastMessage.createdAt).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">
                    {lastMessage
                      ? `${lastMessage.fromId === currentUserId ? "You: " : `${lastMessage.fromName}: `}${lastMessage.body}`
                      : `${group.memberIds.length} members`}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
