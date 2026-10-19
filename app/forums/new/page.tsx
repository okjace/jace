import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/store";
import { NewForumForm } from "@/components/forums/NewForumForm";

export default async function NewForumPage() {
  const session = await auth();
  if (!(await isAdmin(session?.user?.id))) {
    redirect("/forums");
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-6 py-10">
      <h1 className="text-2xl font-semibold">New forum</h1>
      <NewForumForm />
    </div>
  );
}
