import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listCloudFiles } from "@/lib/store";
import { formatBytes } from "@/lib/format";
import { UploadForm } from "@/components/cloud/UploadForm";
import { DeleteFileButton } from "@/components/cloud/DeleteFileButton";

export default async function CloudPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const files = await listCloudFiles(session.user.id);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold">Cloud</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Private file storage — only you can see or download these.
        </p>
      </div>

      <UploadForm />

      {files.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No files yet. Upload one above.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-3 rounded-xl border border-line bg-panel p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{file.name}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {formatBytes(file.size)} &middot;{" "}
                  {new Date(file.createdAt).toLocaleDateString([], {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </div>
              <a
                href={`/api/cloud/${file.id}`}
                className="text-xs font-medium underline underline-offset-2"
              >
                Download
              </a>
              <DeleteFileButton fileId={file.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
