import { EmailSignInForm } from "@/components/auth/EmailSignInForm";

export default function EmailSignInPage() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-10">
      <h1 className="text-2xl font-semibold">Sign in with email</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Enter the verified email address on your account and we&apos;ll send
        you a link to sign in — no password needed.
      </p>
      <EmailSignInForm />
    </div>
  );
}
