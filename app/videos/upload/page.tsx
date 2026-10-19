import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getPostBlockReason } from "@/lib/permissions";
import { getUserById, listOrgsForUser } from "@/lib/store";
import { VideoUploadForm } from "@/components/videos/VideoUploadForm";

export default async function UploadVideoPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/sign-in");
  }
  const userId = session.user.id;
  const blocked = await getPostBlockReason(userId, "upload videos");

  const [profile, orgs] = await Promise.all([
    getUserById(userId),
    listOrgsForUser(userId),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-6 py-10">
      <h1 className="text-2xl font-semibold">Upload a video</h1>
      {blocked ? (
        <p className="text-sm text-red-500">{blocked}</p>
      ) : (
      <VideoUploadForm
        defaultTitle={profile?.defaultVideoTitle ?? ""}
        defaultDescription={profile?.defaultVideoDescription ?? ""}
        orgs={orgs.map((o) => ({ id: o.id, name: o.name }))}
      />
      )}
    </div>
  );
}
