import Link from "next/link";
import { ConfirmVerificationButton } from "@/components/account/ConfirmVerificationButton";

export default async function VerifyEmailPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-4 px-6 py-10 text-center">
      <ConfirmVerificationButton token={token} />
      <Link href="/account" className="text-sm underline underline-offset-2">
        Go to account settings
      </Link>
    </div>
  );
}
