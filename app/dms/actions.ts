"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { resolveDmActor } from "@/lib/permissions";
import { getUserByUsername } from "@/lib/store";

export async function startConversationAction(
  _prevState: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const username = String(formData.get("username") ?? "").trim();
  if (!username) {
    return { error: "Enter a username." };
  }

  const user = await getUserByUsername(username);
  if (!user) {
    return { error: "No user with that username." };
  }
  const asOrgId = String(formData.get("asOrgId") ?? "") || null;
  const actor = await resolveDmActor(
    session.user.id,
    session.user.name, asOrgId);
  if (!actor) return { error: "You can't message as that organization." };
  if (user.id === actor.id) {
    return { error: "You can't message yourself." };
  }

  redirect(actor.type === "org" ? `/dms/${user.id}?as=${actor.id}` : `/dms/${user.id}`);
}
