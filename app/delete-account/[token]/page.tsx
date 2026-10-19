import { ConfirmDeletionButton } from "@/components/account/ConfirmDeletionButton";

export default async function DeleteAccountConfirmPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 px-6 py-10">
      <h1 className="text-2xl font-semibold">Delete your account?</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        This permanently deletes your profile, videos, projects, and scores.
        This can&apos;t be undone.
      </p>
      <ConfirmDeletionButton token={token} />
    </div>
  );
}
