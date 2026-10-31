"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { MAX_TERM_LENGTH, MAX_TERMS, saveAutomodSettings } from "@/lib/automod";
import { isAdmin } from "@/lib/store";

type State = { error?: string; success?: string };

/** Saves the auto-moderation settings. Jace admins only. */
export async function saveAutomodSettingsAction(_prev: State, formData: FormData): Promise<State> {
  const session = await auth();
  if (!session?.user?.id || !(await isAdmin(session.user.id))) return { error: "Only Jace admins can change auto moderation." };

  const lines = (name: string) => [
    ...new Set(
      String(formData.get(name) ?? "")
        .split("\n")
        .map((t) => t.trim().replace(/\s+/g, " "))
        .filter(Boolean),
    ),
  ];
  const terms = lines("blockedTerms");
  const usernames = lines("blockedUsernames");
  for (const [list, what] of [[terms, "blocked words or phrases"], [usernames, "blocked usernames"]] as const) {
    if (list.length > MAX_TERMS) return { error: `At most ${MAX_TERMS} ${what}.` };
    const tooLong = list.find((t) => t.length > MAX_TERM_LENGTH);
    if (tooLong) return { error: `"${tooLong.slice(0, 20)}…" is too long (at most ${MAX_TERM_LENGTH} characters).` };
  }

  const int = (name: string, min: number, max: number) => {
    const n = Number(formData.get(name) ?? 0);
    return Number.isInteger(n) && n >= min && n <= max ? n : null;
  };
  const maxLinks = int("maxLinks", 0, 50);
  const autoMuteAfter = int("autoMuteAfter", 0, 100);
  const autoMuteHours = int("autoMuteHours", 0, 24 * 365);
  if (maxLinks === null) return { error: "Links per post must be 0 to 50." };
  if (autoMuteAfter === null) return { error: "Auto-mute after must be 0 to 100 blocked posts." };
  if (autoMuteHours === null) return { error: "Auto-mute length must be 0 to 8760 hours." };

  await saveAutomodSettings(
    {
      enabled: formData.get("enabled") === "on",
      blockedTerms: terms,
      blockedUsernames: usernames,
      blockPostImages: formData.get("blockPostImages") === "on",
      blockProfileImages: formData.get("blockProfileImages") === "on",
      maxLinks,
      autoMuteAfter,
      autoMuteMinutes: autoMuteHours * 60,
    },
    session.user.id,
  );
  revalidatePath("/profile/[userId]", "page");
  return { success: "Auto moderation saved." };
}
