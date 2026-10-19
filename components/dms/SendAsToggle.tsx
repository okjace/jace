"use client";

import { useRouter } from "next/navigation";

/** Switches which identity a DM is sent from — each identity has its own conversation with the other party. */
export function SendAsToggle({
  otherId,
  currentId,
  userId,
  userName,
  orgs,
}: {
  otherId: string;
  currentId: string;
  userId: string;
  userName: string;
  orgs: { id: string; name: string }[];
}) {
  const router = useRouter();
  const options = [
    { id: userId, name: `${userName} (you)` },
    ...orgs.filter((o) => o.id !== otherId),
  ];
  if (options.length < 2 || otherId === userId) return null;

  return (
    <label className="flex items-center gap-2 text-xs font-medium">
      Send as
      <select
        value={currentId}
        onChange={(e) => {
          const id = e.target.value;
          router.push(id === userId ? `/dms/${otherId}` : `/dms/${otherId}?as=${id}`);
        }}
        className="rounded-lg border border-line bg-background px-2 py-1 text-xs dark:bg-background"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}
