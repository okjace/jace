/** The Jace mark: a green tile with a J, in the Jace Social accent. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      <path
        d="M19.5 8.5v10.25a5 5 0 0 1-9.6 1.95"
        fill="none"
        stroke="var(--on-accent)"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
