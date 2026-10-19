import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { clearAddingAccount, getActiveSession, upsertAccount } from "@/lib/accountSwitcher";
import { getStoredUserById } from "@/lib/store";

/**
 * Landing spot for any sign-in that finished while the Add account popup's
 * flag was set (GitHub, emailed link, sign-up, sign-in page) — see
 * afterSignInPath. By now the browser is sending the new account's session
 * cookie, so save it to the switcher, then carry on to the home page.
 */
export async function GET(): Promise<never> {
  const session = await auth();
  const active = await getActiveSession();
  if (session?.user?.id && active) {
    // session.user.name is the provider's display name for GitHub sign-ins,
    // not necessarily the Jace username — look that up instead.
    const user = await getStoredUserById(session.user.id);
    if (user) await upsertAccount(user.id, user.username, active.value);
  }
  await clearAddingAccount();
  redirect("/");
}
