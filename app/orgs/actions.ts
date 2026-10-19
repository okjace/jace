"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { addOrg, awaitReadYourWrite, getOrgById } from "@/lib/store";
import { getPostBlockReason } from "@/lib/permissions";
import { uploadFile } from "@/lib/storage";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

async function uploadImage(
  file: FormDataEntryValue | null,
  pathPrefix: string,
): Promise<string | undefined> {
  if (!(file instanceof File) || file.size === 0) return undefined;
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Images must be 4MB or smaller.");
  }
  if (!file.type.startsWith("image/")) {
    throw new Error("File must be an image.");
  }
  return uploadFile(`${pathPrefix}/${randomUUID()}`, file, file.type);
}

export async function createOrgAction(
  _prevState: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "You must be signed in to create an organization." };
  }
  const blockReason = await getPostBlockReason(session.user.id, "create organizations");
  if (blockReason) return { error: blockReason };

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (name.length < 2 || name.length > 80) {
    return { error: "Organization name must be 2-80 characters." };
  }
  if (description.length > 2000) {
    return { error: "Description is too long." };
  }

  let imageUrl: string | undefined;
  let bannerUrl: string | undefined;
  try {
    imageUrl = await uploadImage(formData.get("icon"), "orgs/icons");
    bannerUrl = await uploadImage(formData.get("banner"), "orgs/banners");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Upload failed." };
  }

  const id = randomUUID();
  await addOrg({
    id,
    name,
    description,
    imageUrl,
    bannerUrl,
    ownerId: session.user.id,
    memberIds: [session.user.id],
    adminIds: [],
    createdAt: new Date().toISOString(),
  });

  await awaitReadYourWrite(async () => (await getOrgById(id)) !== null);

  redirect(`/orgs/${id}`);
}
