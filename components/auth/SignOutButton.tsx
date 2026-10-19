"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/" })}
      className="h-9 w-fit rounded-full border border-line px-4 text-xs font-medium transition-colors hover:bg-foreground/[.05]"
    >
      Sign out
    </button>
  );
}
