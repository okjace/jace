import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-10">
      <h1 className="text-2xl font-semibold">Reset your password</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Enter the email address on your account and we&apos;ll send you a link
        to set a new password.
      </p>
      <ForgotPasswordForm />
    </div>
  );
}
