import { redirect } from "next/navigation";
import { auth } from "@/auth";

/** "Sign in with Jace" app registration is the Developer tab of the account manager. */
export default async function OAuthAppsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  redirect(`/profile/${session.user.id}?tab=developer`);
}
