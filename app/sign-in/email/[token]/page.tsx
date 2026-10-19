import { hashToken } from "@/lib/tokens";
import { checkEmailSignInToken } from "@/lib/store";
import { ConfirmEmailSignInButton } from "@/components/auth/ConfirmEmailSignInButton";

export default async function ConfirmEmailSignInPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const userId = await checkEmailSignInToken(hashToken(token));

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 px-6 py-10">
      {userId ? (
        <>
          <h1 className="text-2xl font-semibold">Sign in to Jace</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Click below to finish signing in.
          </p>
          <ConfirmEmailSignInButton token={token} />
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold">Link expired</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            This sign-in link is invalid or has expired. Request a new one
            from the sign-in page.
          </p>
        </>
      )}
    </div>
  );
}
