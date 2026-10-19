"use client";

export function PostAsSelect({
  orgs,
  value,
  onChange,
}: {
  orgs: { id: string; name: string }[];
  value?: string;
  onChange?: (orgId: string) => void;
}) {
  if (orgs.length === 0) return null;
  return (
    <label className="flex items-center gap-2 text-xs font-medium">
      Post as
      <select
        name="postAsOrgId"
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        className="rounded-lg border border-line bg-background px-2 py-1 text-xs dark:bg-background"
      >
        <option value="">Yourself</option>
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}
