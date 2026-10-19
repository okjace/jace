import "server-only";
import { cookies } from "next/headers";

/**
 * The account switcher lets someone remember several of their own accounts
 * in this browser and swap the active one without signing in again. Each
 * saved entry stores that account's own NextAuth session token, captured
 * right after it signed in normally (password/2FA) — "switching" just moves
 * which token is the active session cookie, the same way a browser keeps
 * several logged-in profiles side by side. No entry is ever created without
 * that account completing a real sign-in first.
 */

export const MAX_SAVED_ACCOUNTS = 6;
const SWITCHER_COOKIE = "saved_accounts";
// NextAuth prefixes this with "__Secure-" over https — matching on the
// suffix finds it either way instead of hardcoding one form.
const SESSION_COOKIE_SUFFIX = "authjs.session-token";
const THIRTY_DAYS = 60 * 60 * 24 * 30;
// Stay well clear of the ~4096-byte per-cookie limit even before hitting
// MAX_SAVED_ACCOUNTS, in case tokens end up larger than expected.
const MAX_COOKIE_BYTES = 3800;

export type SavedAccount = {
  id: string;
  username: string;
  token: string;
};

function isSavedAccount(value: unknown): value is SavedAccount {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as SavedAccount).id === "string" &&
    typeof (value as SavedAccount).username === "string" &&
    typeof (value as SavedAccount).token === "string"
  );
}

export async function readSavedAccounts(): Promise<SavedAccount[]> {
  const raw = (await cookies()).get(SWITCHER_COOKIE)?.value;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isSavedAccount) : [];
  } catch {
    return [];
  }
}

async function writeSavedAccounts(list: SavedAccount[]): Promise<void> {
  (await cookies()).set(SWITCHER_COOKIE, JSON.stringify(list), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: THIRTY_DAYS,
  });
}

/**
 * Finds NextAuth's session cookie under whatever name/prefix it's currently
 * using. Exported so callers can capture a token *before* doing anything
 * that overwrites the cookie (signing in as another account, or switching)
 * — `upsertAccount` deliberately takes a token rather than re-reading this
 * itself, since by the time it runs the active cookie may already belong to
 * a different account than the one being saved.
 */
export async function getActiveSession(): Promise<{ name: string; value: string } | null> {
  const match = (await cookies())
    .getAll()
    .find((c) => c.name.endsWith(SESSION_COOKIE_SUFFIX) && c.value);
  return match ? { name: match.name, value: match.value } : null;
}

/** Overwrites the active session cookie with a previously-saved token. */
async function setActiveSessionCookie(name: string, value: string): Promise<void> {
  (await cookies()).set(name, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: name.startsWith("__Secure-") || name.startsWith("__Host-"),
    path: "/",
    maxAge: THIRTY_DAYS,
  });
}

/**
 * Remembers the given account under its own session token (id/username come
 * from `auth()`, since the session cookie itself is an encrypted JWE we
 * can't read id/name out of here). Callers must capture `token` via
 * `getActiveSession()` at the moment it actually belongs to this account —
 * not after a later signIn()/switch may have overwritten the cookie.
 */
export async function upsertAccount(
  id: string,
  username: string,
  token: string,
): Promise<{ error?: string }> {
  const list = await readSavedAccounts();
  const withoutExisting = list.filter((a) => a.id !== id);
  if (withoutExisting.length >= MAX_SAVED_ACCOUNTS) {
    return {
      error: `You can only save up to ${MAX_SAVED_ACCOUNTS} accounts — remove one first.`,
    };
  }
  const next = [...withoutExisting, { id, username, token }];
  if (JSON.stringify(next).length > MAX_COOKIE_BYTES) {
    return { error: "Saved accounts list is full — remove one first." };
  }
  await writeSavedAccounts(next);
  return {};
}

export async function removeSavedAccount(id: string): Promise<void> {
  const list = await readSavedAccounts();
  await writeSavedAccounts(list.filter((a) => a.id !== id));
}

/** Swaps the active session to a saved account's token. Returns false if it's no longer saved. */
export async function activateSavedAccount(id: string): Promise<boolean> {
  const list = await readSavedAccounts();
  const account = list.find((a) => a.id === id);
  if (!account) return false;
  const session = await getActiveSession();
  const name = session?.name ?? "authjs.session-token";
  await setActiveSessionCookie(name, account.token);
  return true;
}

/**
 * "Add account" can finish on a different page than it started (GitHub's
 * OAuth round trip, an emailed sign-in link, signing up a brand-new
 * account), so opening the Add account popup sets this short-lived flag.
 * Any sign-in that completes while it's set lands on ADD_ACCOUNT_COMPLETE_PATH,
 * which saves the newly signed-in account to the switcher. The account
 * that was active when the popup opened is saved up front (see
 * beginAddAccountAction), since its token is only readable until then.
 */
const ADDING_COOKIE = "adding_account";
const ADDING_MAX_AGE = 60 * 30;
export const ADD_ACCOUNT_COMPLETE_PATH = "/account/add-complete";

export async function markAddingAccount(): Promise<void> {
  (await cookies()).set(ADDING_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADDING_MAX_AGE,
  });
}

export async function clearAddingAccount(): Promise<void> {
  (await cookies()).delete(ADDING_COOKIE);
}

/** Where a sign-in should land: the add-account completion route while adding, otherwise `fallback`. */
export async function afterSignInPath(fallback: string): Promise<string> {
  const adding = (await cookies()).get(ADDING_COOKIE)?.value === "1";
  return adding ? ADD_ACCOUNT_COMPLETE_PATH : fallback;
}
