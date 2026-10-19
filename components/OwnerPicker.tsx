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
        className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
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
