import { redirect } from "next/navigation";
import { auth } from "@/auth";

/** Account settings now live in the account manager on your profile. */
export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  redirect(`/profile/${session.user.id}?tab=account`);
}
