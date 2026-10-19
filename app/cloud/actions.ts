"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { deleteCloudFile, getCloudFileMeta } from "@/lib/store";

export async function deleteCloudFileAction(
  fileId: string,
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const meta = await getCloudFileMeta(fileId);
  if (!meta || meta.ownerId !== session.user.id) {
    return { error: "File not found." };
  }

  await deleteCloudFile(fileId);
  revalidatePath("/cloud");
  return {};
}
