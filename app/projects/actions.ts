"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SUPPORT_ORG_ID } from "@/lib/constants";
import {
  addProject,
  awaitReadYourWrite,
  getOrgById,
  getProjectById,
  isAdmin,
  listCompanyProjects,
} from "@/lib/store";
import { uploadFile } from "@/lib/storage";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

async function uploadImage(
  file: FormDataEntryValue | null,
  pathPrefix: string,
): Promise<string> {
  if (!(file instanceof File) || file.size === 0) return "";
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Images must be 4MB or smaller.");
  }
  if (!file.type.startsWith("image/")) {
    throw new Error("File must be an image.");
  }
  return uploadFile(`${pathPrefix}/${randomUUID()}`, file, file.type);
}

export async function createProjectAction(
  _prevState: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "You must be signed in to create a project." };
  }
  // The site only lists the company's own projects, so only the owner and admins add them.
  if (!(await isAdmin(session.user.id))) {
    return { error: "Only Jace staff can add projects." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (name.length < 2 || name.length > 80) {
    return { error: "Project name must be 2-80 characters." };
  }
  if (description.length > 2000) {
    return { error: "Description is too long." };
  }

  // Company projects belong to the Jace Official org.
  const org = await getOrgById(SUPPORT_ORG_ID);
  const ownerId = SUPPORT_ORG_ID;
  const ownerType = "org" as const;
  const ownerName = org?.name ?? "Jace Official";

  let iconUrl: string;
  let bannerUrl: string;
  try {
    iconUrl = await uploadImage(formData.get("icon"), "projects/icons");
    bannerUrl = await uploadImage(formData.get("banner"), "projects/banners");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Upload failed." };
  }

  const id = randomUUID();
  await addProject({
    id,
    ownerId,
    ownerType,
    ownerName,
    name,
    description,
    readme: "",
    iconUrl,
    bannerUrl: bannerUrl || undefined,
    sortOrder: (await listCompanyProjects()).length,
    versions: [],
    comments: [],
    issues: [],
    createdAt: new Date().toISOString(),
  });

  await awaitReadYourWrite(async () => (await getProjectById(id)) !== null);

  redirect(`/projects/${id}`);
}
