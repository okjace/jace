const PALETTE = [
  "#f97316",
  "#ef4444",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

export function Avatar({
  name,
  imageUrl,
  size = 32,
  shape = "circle",
  className = "",
}: {
  name: string;
  imageUrl?: string | null;
  size?: number;
  shape?: "circle" | "square";
  className?: string;
}) {
  const rounded = shape === "circle" ? "rounded-full" : "rounded-lg";

  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={imageUrl}
        alt=""
        className={`shrink-0 object-cover ${rounded} ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  const initials = (name.trim().slice(0, 2) || "?").toUpperCase();

  return (
    <div
      className={`flex shrink-0 items-center justify-center font-semibold text-white ${rounded} ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: colorFor(name || "?"),
      }}
    >
      {initials}
    </div>
  );
}
