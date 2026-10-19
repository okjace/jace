import Link from "next/link";
import { signIn } from "@/auth";
import { afterSignInPath } from "@/lib/accountSwitcher";
import { safeNextPath } from "@/lib/safeRedirect";

const PROVIDERS = [{ id: "github", label: "Continue with GitHub" }] as const;

export function OAuthButtons({ next }: { next?: string }) {
  const redirectTo = safeNextPath(next) ?? "/";
  return (
    <div className="flex flex-col gap-2">
      {PROVIDERS.map((provider) => (
        <form
          key={provider.id}
          action={async () => {
            "use server";
            await signIn(provider.id, { redirectTo: await afterSignInPath(redirectTo) });
          }}
        >
          <button
            type="submit"
            className="h-11 w-full rounded-md border border-line px-4 text-sm font-medium transition-colors hover:bg-foreground/[.05]"
          >
            {provider.label}
          </button>
        </form>
      ))}
      <Link
        href="/sign-in/email"
        className="flex h-11 w-full items-center justify-center rounded-md border border-line px-4 text-sm font-medium transition-colors hover:bg-foreground/[.05]"
      >
        Continue with email
      </Link>
    </div>
  );
}
