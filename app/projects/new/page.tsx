import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/store";
import { NewProjectForm } from "@/components/projects/NewProjectForm";

export default async function NewProjectPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/sign-in");
  }
  if (!(await isAdmin(session.user.id))) redirect("/projects");

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-6 py-10">
      <h1 className="text-2xl font-semibold">New project</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Adds a project to the home page under Jace Official. Add its website
        and source links from the project page afterwards.
      </p>
      <NewProjectForm />
    </div>
  );
}
