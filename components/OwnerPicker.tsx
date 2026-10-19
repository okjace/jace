"use client";

type OrgOption = { id: string; name: string };

export function OwnerPicker({
  orgs,
  value,
  onChange,
}: {
  orgs: OrgOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  if (orgs.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="postAsOrgId" className="text-sm font-medium">
        Post as
      </label>
      <select
        id="postAsOrgId"
        name="postAsOrgId"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40"
      >
        <option value="">Yourself</option>
        {orgs.map((org) => (
          <option key={org.id} value={org.id}>
            {org.name}
          </option>
        ))}
      </select>
    </div>
  );
}
