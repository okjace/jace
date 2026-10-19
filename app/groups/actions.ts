"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  addGroupChat,
  addGroupMember,
  getGroupChat,
  getUserByUsername,
  removeGroupMember,
} from "@/lib/store";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  return session.user.id;
}

export async function createGroupAction(
  _prevState: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const userId = await requireUserId();
  const name = String(formData.get("name") ?? "").trim();
  const usernamesRaw = String(formData.get("usernames") ?? "");

  if (!name) {
    return { error: "Give the group a name." };
  }

  const usernames = usernamesRaw
    .split(/[,\n]/)
    .map((u) => u.trim())
    .filter(Boolean);

  const memberIds = new Set<string>([userId]);
  for (const username of usernames) {
    const user = await getUserByUsername(username);
    if (!user) {
      return { error: `No user named "${username}".` };
    }
    memberIds.add(user.id);
  }

  if (memberIds.size < 2) {
    return { error: "Add at least one other member." };
  }

  const group = {
    id: randomUUID(),
    name: name.slice(0, 60),
    creatorId: userId,
    memberIds: [...memberIds],
    createdAt: new Date().toISOString(),
  };
  await addGroupChat(group);

  redirect(`/groups/${group.id}`);
}

export async function addGroupMemberAction(
  groupId: string,
  _prevState: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const userId = await requireUserId();
  const group = await getGroupChat(groupId);
  if (!group || !group.memberIds.includes(userId)) {
    return { error: "Group not found." };
  }

  const username = String(formData.get("username") ?? "").trim();
  if (!username) {
    return { error: "Enter a username." };
  }

  const user = await getUserByUsername(username);
  if (!user) {
    return { error: `No user named "${username}".` };
  }
  if (group.memberIds.includes(user.id)) {
    return { error: `${user.username} is already in this group.` };
  }

  await addGroupMember(groupId, user.id);
  revalidatePath(`/groups/${groupId}`);
  return {};
}

export async function leaveGroupAction(groupId: string): Promise<void> {
  const userId = await requireUserId();
  await removeGroupMember(groupId, userId);
  redirect("/dms");
}
