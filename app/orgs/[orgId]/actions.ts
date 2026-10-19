"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  addOrgMember,
  awaitReadYourWrite,
  deleteOrg,
  getOrgById,
  getUserByUsername,
  removeOrgMember,
  setOrgAdmin,
  updateOrg,
} from "@/lib/store";
import { uploadFile } from "@/lib/storage";
import type { SocialLink } from "@/lib/types";

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

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function parseSocialLinks(raw: string): SocialLink[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((l): l is { label: unknown; url: unknown } => !!l && typeof l === "object")
      .map((l) => ({
        id: randomUUID(),
        label: String(l.label ?? "").slice(0, 40),
        url: normalizeUrl(String(l.url ?? "")).slice(0, 300),
      }))
      .filter((l) => l.label && l.url)
      .slice(0, 10);
  } catch {
    return [];
  }
}

async function assertIsMember(orgId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  const org = await getOrgById(orgId);
  if (!org) throw new Error("Organization not found");
  if (!org.memberIds.includes(session.user.id)) throw new Error("Forbidden");
  return { org, userId: session.user.id };
}

async function assertIsOwner(orgId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  const org = await getOrgById(orgId);
  if (!org) throw new Error("Organization not found");
  if (org.ownerId !== session.user.id) throw new Error("Forbidden");
  return org;
}

export async function updateOrgAction(orgId: string, formData: FormData) {
  await assertIsMember(orgId);

  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const description = String(formData.get("description") ?? "")
    .trim()
    .slice(0, 2000);
  const website = normalizeUrl(String(formData.get("website") ?? "")).slice(
    0,
    200,
  );
  const socialLinks = parseSocialLinks(String(formData.get("socialLinks") ?? "[]"));

  if (name.length < 2) throw new Error("Organization name is too short.");

  const imageUrl = await uploadImage(formData.get("icon"), "orgs/icons");
  const bannerUrl = await uploadImage(formData.get("banner"), "orgs/banners");

  await updateOrg(orgId, {
    name,
    description,
    website,
    socialLinks,
    ...(imageUrl ? { imageUrl } : {}),
    ...(bannerUrl ? { bannerUrl } : {}),
  });

  revalidatePath(`/orgs/${orgId}`);
  revalidatePath("/orgs");
}

export async function addMemberAction(orgId: string, formData: FormData) {
  await assertIsOwner(orgId);

  const username = String(formData.get("username") ?? "").trim();
  if (!username) throw new Error("Enter a username.");

  const user = await getUserByUsername(username);
  if (!user) throw new Error("No user with that username.");

  await addOrgMember(orgId, user.id);
  revalidatePath(`/orgs/${orgId}`);
}

export async function removeMemberAction(orgId: string, userId: string) {
  const org = await assertIsOwner(orgId);
  if (userId === org.ownerId) throw new Error("Can't remove the owner.");

  await removeOrgMember(orgId, userId);
  revalidatePath(`/orgs/${orgId}`);
}

export async function setOrgAdminAction(orgId: string, userId: string, admin: boolean) {
  const org = await assertIsOwner(orgId);
  if (userId === org.ownerId) throw new Error("The owner already has full access.");
  if (!org.memberIds.includes(userId)) throw new Error("Only members can be org admins.");

  await setOrgAdmin(orgId, userId, admin);
  revalidatePath(`/orgs/${orgId}`);
}

export async function deleteOrgAction(orgId: string) {
  await assertIsOwner(orgId);
  await deleteOrg(orgId);
  await awaitReadYourWrite(async () => (await getOrgById(orgId)) === null);
  revalidatePath("/orgs");
}
