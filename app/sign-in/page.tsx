import Link from "next/link";
import { SignInForm } from "@/components/auth/SignInForm";
import { OAuthButtons } from "@/components/auth/OAuthButtons";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-10">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <OAuthButtons next={next} />
      <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
        <div className="h-px flex-1 bg-black/10 dark:bg-white/15" />
        or
        <div className="h-px flex-1 bg-black/10 dark:bg-white/15" />
      </div>
      <SignInForm next={next} />
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        No account?{" "}
        <Link href="/sign-up" className="underline underline-offset-2">
          Sign up
        </Link>
      </p>
    </div>
  );
}
