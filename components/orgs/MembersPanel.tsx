"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { addMemberAction, removeMemberAction, setOrgAdminAction } from "@/app/orgs/[orgId]/actions";
import { Avatar } from "@/components/Avatar";

type Member = { id: string; username: string; imageUrl?: string };

export function MembersPanel({
  orgId,
  members,
  ownerId,
  adminIds,
  isOwner,
}: {
  orgId: string;
  members: Member[];
  ownerId: string;
  adminIds: string[];
  isOwner: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {members.map((member) => (
          <li key={member.id} className="flex items-center gap-2">
            <Link
              href={`/profile/${member.id}`}
              className="flex flex-1 items-center gap-2 text-sm hover:underline"
            >
              <Avatar name={member.username} imageUrl={member.imageUrl} size={24} />
              {member.username}
              {member.id === ownerId && (
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  (owner)
                </span>
              )}
              {adminIds.includes(member.id) && (
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  (admin)
                </span>
              )}
            </Link>
            {isOwner && member.id !== ownerId && (
              <button
                disabled={busyId === member.id}
                onClick={async () => {
                  setError(null);
                  setBusyId(member.id);
                  try {
                    await setOrgAdminAction(orgId, member.id, !adminIds.includes(member.id));
                    router.refresh();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Failed to update admin.");
                  } finally {
                    setBusyId(null);
                  }
                }}
                className="text-xs font-medium underline underline-offset-2 disabled:opacity-50"
              >
                {adminIds.includes(member.id) ? "Remove admin" : "Make admin"}
              </button>
            )}
            {isOwner && member.id !== ownerId && (
              <button
                disabled={busyId === member.id}
                onClick={async () => {
                  setError(null);
                  setBusyId(member.id);
                  try {
                    await removeMemberAction(orgId, member.id);
                    router.refresh();
                  } catch (err) {
                    setError(
                      err instanceof Error ? err.message : "Failed to remove member.",
                    );
                  } finally {
                    setBusyId(null);
                  }
                }}
                className="text-xs text-red-500 disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>

      {isOwner && (
        <form
          action={async (formData) => {
            setError(null);
            try {
              await addMemberAction(orgId, formData);
              router.refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed to add member.");
            }
          }}
          className="flex gap-2"
        >
          <input
            name="username"
            placeholder="Username to add"
            required
            className="flex-1 rounded-lg border border-line bg-background px-3 py-1.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          <button
            type="submit"
            className="h-9 rounded-full border border-line px-4 text-xs font-medium"
          >
            Add
          </button>
        </form>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
