/**
 * The root admin: the one account that can never lose admin rights and is
 * the only one allowed to grant or revoke admin status for anyone else (see
 * `setUserAdmin` in `lib/store.ts`). Other accounts can be promoted to admin
 * via Account settings, tracked in the `users.is_admin` column — see
 * `isAdmin` in `lib/store.ts` for the full (root-or-granted) check.
 */
export const ROOT_ADMIN_ID = "00000000-0000-0000-0000-000000000000";

export function isRootAdmin(userId: string | null | undefined): boolean {
  return !!userId && userId === ROOT_ADMIN_ID;
}

/**
 * The org (Jace Official) that banned and muted users can still message —
 * it's their only way to appeal. See `getPostBlockReason` and the DM route.
 */
export const SUPPORT_ORG_ID = "00000000-0000-0000-0000-000000000001";

/**
 * The "READ ME" forum: a one-way notice board (admin-only post/reply) that
 * everyone should see the current contents of. New accounts see everything
 * in it once, in a popup; existing accounts get the popup again only for
 * topics posted since they last dismissed it. See `getUnseenReadmeTopics`/
 * `markReadmeSeen` in `lib/store.ts` and `ReadmePopup`.
 */
export const README_FORUM_ID = "7b1b592b-ae13-4094-be3c-b18f95d1d347";

/** Release announcements ("New: …") and how-to docs. With README, the only forums still reachable (see proxy.ts). */
export const NEWS_FORUM_ID = "ead2b942-f119-4820-8c08-469c8c4f6f91";
export const DOCS_FORUM_ID = "1360d7bf-06f7-4d1b-9243-2c4777b97a7d";

/** The READ ME topics holding the published Terms of Service and Privacy Policy, shown by the footer's buttons. */
export const TERMS_TOPIC_ID = "7a9f0277-e85e-44f2-91da-353a1b3b3451";
export const PRIVACY_TOPIC_ID = "3e462dc4-1734-400a-8ca6-66a80ff32ac7";

/** Upper bound on a user's custom CSS (Edit tab → Appearance), in characters. */
export const MAX_CUSTOM_CSS_LENGTH = 20000;

/**
 * Color themes (Edit tab → Appearance): each tints the page background, with
 * a light shade for light mode and a deep one for dark mode. Applied by the
 * root layout as a <style> overriding `--background`.
 */
export const THEME_COLORS = [
  { id: "red", label: "Red", light: "#fee2e2", dark: "#450a0a" },
  { id: "orange", label: "Orange", light: "#ffedd5", dark: "#431407" },
  { id: "amber", label: "Amber", light: "#fef3c7", dark: "#451a03" },
  { id: "yellow", label: "Yellow", light: "#fef9c3", dark: "#422006" },
  { id: "lime", label: "Lime", light: "#ecfccb", dark: "#1a2e05" },
  { id: "green", label: "Green", light: "#dcfce7", dark: "#052e16" },
  { id: "emerald", label: "Emerald", light: "#d1fae5", dark: "#022c22" },
  { id: "teal", label: "Teal", light: "#ccfbf1", dark: "#042f2e" },
  { id: "cyan", label: "Cyan", light: "#cffafe", dark: "#083344" },
  { id: "sky", label: "Sky", light: "#e0f2fe", dark: "#082f49" },
  { id: "blue", label: "Blue", light: "#dbeafe", dark: "#172554" },
  { id: "indigo", label: "Indigo", light: "#e0e7ff", dark: "#1e1b4b" },
  { id: "violet", label: "Violet", light: "#ede9fe", dark: "#2e1065" },
  { id: "purple", label: "Purple", light: "#f3e8ff", dark: "#3b0764" },
  { id: "fuchsia", label: "Fuchsia", light: "#fae8ff", dark: "#4a044e" },
  { id: "pink", label: "Pink", light: "#fce7f3", dark: "#500724" },
  { id: "rose", label: "Rose", light: "#ffe4e6", dark: "#4c0519" },
  { id: "slate", label: "Slate", light: "#e2e8f0", dark: "#020617" },
  { id: "stone", label: "Stone", light: "#e7e5e4", dark: "#0c0a09" },
] as const;

/** Largest background image a user can upload (Edit tab → Appearance). */
export const MAX_BACKGROUND_IMAGE_BYTES = 10 * 1024 * 1024;
