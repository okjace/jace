import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getForumById, isAdmin } from "@/lib/store";
import { listActingOrgs } from "@/lib/permissions";
import { NewTopicForm } from "@/components/forums/NewTopicForm";

export default async function NewTopicPage({
  params,
}: {
  params: Promise<{ forumId: string }>;
}) {
  const { forumId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/forums/${forumId}`);

  const admin = await isAdmin(session.user.id);
  const forum = await getForumById(forumId);
  if (!forum) notFound();
  if (forum.viewPermission === "adminOnly" && !admin) notFound();
  if (forum.postPermission === "adminOnly" && !admin) {
    redirect(`/forums/${forumId}`);
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <h1 className="text-2xl font-semibold">New topic in {forum.name}</h1>
      <NewTopicForm
        forumId={forumId}
        orgs={(await listActingOrgs(session.user.id)).map((o) => ({ id: o.id, name: o.name }))}
      />
    </div>
  );
}
