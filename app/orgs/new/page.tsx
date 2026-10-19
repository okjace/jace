import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getPostBlockReason } from "@/lib/permissions";
import { NewOrgForm } from "@/components/orgs/NewOrgForm";

export default async function NewOrgPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/sign-in");
  }
  const blocked = await getPostBlockReason(session.user.id, "create organizations");

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-6 py-10">
      <h1 className="text-2xl font-semibold">New organization</h1>
      {blocked ? <p className="text-sm text-red-500">{blocked}</p> : <NewOrgForm />}
    </div>
  );
}
