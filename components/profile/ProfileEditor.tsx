"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { updateProfile } from "@/app/profile/[userId]/actions";
import type { AccountDetails, OAuthClient, OAuthGrant, PublicUser, SocialLink } from "@/lib/types";
import { Avatar } from "@/components/Avatar";
import { pollThenRefresh } from "@/lib/pollRefresh";
import { AdminSettingsPanel } from "@/components/account/AdminSettingsPanel";
import { UsernameForm } from "@/components/account/UsernameForm";
import { EmailForm } from "@/components/account/EmailForm";
import { PasswordForm } from "@/components/account/PasswordForm";
import { TotpSection } from "@/components/account/TotpSection";
import { AppearanceForm } from "@/components/account/AppearanceForm";
import { AccountSwitcher, type SwitcherAccount } from "@/components/account/AccountSwitcher";
import { ConnectedAppsPanel } from "@/components/account/ConnectedAppsPanel";
import { OAuthAppsManager } from "@/components/account/OAuthAppsManager";
import { DeleteDataSection } from "@/components/profile/DeleteDataSection";
import { DeleteAccountSection } from "@/components/profile/DeleteAccountSection";

export type AccountTab =
  | "profile"
  | "account"
  | "security"
  | "appearance"
  | "apps"
  | "developer"
  | "data"
  | "admin";

const TABS: { id: AccountTab; label: string; hint: string }[] = [
  { id: "profile", label: "Profile", hint: "Picture, banner, bio, and links" },
  { id: "account", label: "Account", hint: "Username and email" },
  { id: "security", label: "Security", hint: "Password, two-factor, and saved accounts" },
  { id: "appearance", label: "Appearance", hint: "Mode, color theme, background, and CSS" },
  { id: "apps", label: "Connected apps", hint: "Jace apps and sites you've signed in to" },
  { id: "developer", label: "Developer", hint: "Sign in with Jace for your own apps" },
  { id: "data", label: "Your data", hint: "Delete data or your account" },
  { id: "admin", label: "Admin", hint: "Staff and app moderation" },
];

export type AppModerationEntry = {
  id: string;
  clientName: string;
  action: string;
  targetUserId: string;
  targetName?: string;
  reason: string;
  createdAt: string;
};

function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-line bg-panel p-5">{children}</div>;
}

export function ProfileEditor({
  userId,
  username,
  bio,
  website,
  socialLinks,
  imageUrl,
  bannerUrl,
  defaultVideoTitle,
  defaultVideoDescription,
  account,
  showAdminPanel,
  admins,
  restricted = false,
  savedAccounts,
  oauthGrants,
  oauthApps,
  moderationLog,
  initialTab,
}: {
  userId: string;
  username: string;
  bio: string;
  website?: string;
  socialLinks: SocialLink[];
  imageUrl?: string;
  bannerUrl?: string;
  defaultVideoTitle?: string;
  defaultVideoDescription?: string;
  account: AccountDetails | null;
  showAdminPanel: boolean;
  admins: PublicUser[];
  /** Muted/banned: bio, website, and social links are read-only. */
  restricted?: boolean;
  /** Other accounts saved in this browser's account switcher. */
  savedAccounts: SwitcherAccount[];
  /** Apps this account has signed into via "Sign in with Jace". */
  oauthGrants: OAuthGrant[];
  /** Apps this account registered for "Sign in with Jace". */
  oauthApps: OAuthClient[];
  /** Recent bans/unbans by Jace's apps — only passed to the owner. */
  moderationLog: AppModerationEntry[];
  /** Opens the manager on this tab (from ?tab=, e.g. links from /account). */
  initialTab?: AccountTab;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(!!initialTab);
  const [tab, setTab] = useState<AccountTab>(initialTab ?? "profile");
  const [links, setLinks] = useState<SocialLink[]>(socialLinks);
  const [preview, setPreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [avatarUrlInput, setAvatarUrlInput] = useState("");
  const [avatarFileChosen, setAvatarFileChosen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!editing) {
    return (
      <div className="flex flex-col gap-3">
        <p className="whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">
          {bio || "No bio yet."}
        </p>
        {(website || socialLinks.length > 0) && (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {website && (
              <a
                href={website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm underline underline-offset-2"
              >
                {website.replace(/^https?:\/\//, "")}
              </a>
            )}
            {socialLinks.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm underline underline-offset-2"
              >
                {link.label}
              </a>
            ))}
          </div>
        )}
        <button
          onClick={() => setEditing(true)}
          className="h-9 w-fit rounded-full bg-accent px-4 text-xs font-medium text-on-accent transition-colors hover:bg-accent-hover"
        >
          Manage account
        </button>
      </div>
    );
  }

  function addLink() {
    setLinks((prev) => [...prev, { id: crypto.randomUUID(), label: "", url: "" }]);
  }
  function updateLink(id: string, patch: Partial<SocialLink>) {
    setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }
  function removeLink(id: string) {
    setLinks((prev) => prev.filter((l) => l.id !== id));
  }

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    setError(null);
    setSaved(false);
    formData.set(
      "socialLinks",
      JSON.stringify(links.filter((l) => l.label.trim() && l.url.trim())),
    );
    const newBio = restricted ? bio : String(formData.get("bio") ?? "");
    try {
      await updateProfile(userId, formData);
      setPreview(null);
      setBannerPreview(null);
      setSaved(true);
      await pollThenRefresh(async () => {
        const res = await fetch(`/api/users/${userId}`, { cache: "no-store" });
        if (!res.ok) return false;
        const { user } = (await res.json()) as { user: { bio: string } };
        return user.bio === newBio;
      }, () => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update profile.");
    } finally {
      setSubmitting(false);
    }
  }

  const tabs = TABS.filter((t) => t.id !== "admin" || showAdminPanel);
  const current = tabs.find((t) => t.id === tab) ?? tabs[0];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Manage your Jace account</h2>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="h-8 rounded-full border border-line px-3 text-xs font-medium transition-colors hover:bg-foreground/[.05]"
        >
          Done
        </button>
      </div>
      <div className="flex flex-col gap-6 md:flex-row">
        <nav
          aria-label="Account sections"
          className="flex shrink-0 gap-1 overflow-x-auto md:w-52 md:flex-col md:overflow-visible"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={t.id === current.id ? "page" : undefined}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                t.id === current.id
                  ? "bg-accent/15 font-medium text-foreground"
                  : "text-muted hover:bg-foreground/[.05]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div>
            <h3 className="text-base font-semibold">{current.label}</h3>
            <p className="text-xs text-muted">{current.hint}</p>
          </div>

          {current.id === "profile" && (
            <Card>
        <form action={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="banner" className="text-xs font-medium">
            Banner
          </label>
          {(bannerPreview ?? bannerUrl) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={bannerPreview ?? bannerUrl}
              alt=""
              className="h-24 w-full rounded-md object-cover"
            />
          )}
          <input
            id="banner"
            type="file"
            name="banner"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setBannerPreview(URL.createObjectURL(file));
            }}
            className="text-xs"
          />
        </div>

        <div className="flex items-center gap-4">
          <Avatar name={username} imageUrl={avatarUrlInput || preview || imageUrl} size={64} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="avatar" className="text-xs font-medium">
              Profile picture
            </label>
            <input
              id="avatar"
              type="file"
              name="avatar"
              accept="image/*"
              disabled={!!avatarUrlInput}
              onChange={(e) => {
                const file = e.target.files?.[0];
                setAvatarFileChosen(!!file);
                if (file) setPreview(URL.createObjectURL(file));
              }}
              className="text-xs disabled:opacity-50"
            />
            <input
              name="avatarUrl"
              value={avatarUrlInput}
              onChange={(e) => setAvatarUrlInput(e.target.value)}
              placeholder="Or paste an image URL"
              disabled={avatarFileChosen}
              className="w-56 rounded-lg border border-line bg-background px-2 py-1 text-xs outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-50"
            />
          </div>
        </div>

        {restricted && (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            Your bio, website, and social links can&apos;t be edited while your account is muted or banned.
          </p>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="bio" className="text-sm font-medium">
            Bio
          </label>
          <textarea
            id="bio"
            name="bio"
            defaultValue={bio}
            maxLength={500}
            rows={3}
            disabled={restricted}
            placeholder="Tell people about yourself"
            className="rounded-md disabled:opacity-50 border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="website" className="text-sm font-medium">
            Website
          </label>
          <input
            id="website"
            name="website"
            defaultValue={website ?? ""}
            disabled={restricted}
            placeholder="example.com"
            className="rounded-md disabled:opacity-50 border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Social links</span>
          {links.map((link) => (
            <div key={link.id} className="flex gap-2">
              <input
                value={link.label}
                disabled={restricted}
                onChange={(e) => updateLink(link.id, { label: e.target.value })}
                placeholder="Label (e.g. X)"
                className="w-28 rounded-lg border border-line bg-background px-2 py-1.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
              <input
                value={link.url}
                disabled={restricted}
                onChange={(e) => updateLink(link.id, { url: e.target.value })}
                placeholder="https://..."
                className="flex-1 rounded-lg border border-line bg-background px-2 py-1.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
              <button
                type="button"
                onClick={() => removeLink(link.id)}
                disabled={restricted}
                className="text-xs text-red-500 disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addLink}
            disabled={restricted}
            className="w-fit text-xs font-medium underline underline-offset-2 disabled:opacity-50"
          >
            + Add link
          </button>
        </div>

        {/* Videos are retired; keep any saved upload defaults as they are. */}
        <input type="hidden" name="defaultVideoTitle" value={defaultVideoTitle ?? ""} />
        <input type="hidden" name="defaultVideoDescription" value={defaultVideoDescription ?? ""} />

        {error && <p className="text-sm text-red-500">{error}</p>}
        {saved && <p className="text-sm text-green-600 dark:text-green-500">Profile saved.</p>}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="h-9 rounded-full bg-accent px-4 text-xs font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setPreview(null);
              setError(null);
            }}
            className="h-9 rounded-full border border-line px-4 text-xs font-medium"
          >
            Cancel
          </button>
        </div>
        </form>
            </Card>
          )}

          {current.id === "account" && account && (
            <>
              <Card>
                <UsernameForm username={account.username} />
              </Card>
              <Card>
                <EmailForm
                  email={account.email}
                  emailVerified={account.emailVerified}
                  pendingEmail={account.pendingEmail}
                />
              </Card>
            </>
          )}

          {current.id === "security" && account && (
            <>
              <Card>
                <PasswordForm hasPassword={account.hasPassword} />
              </Card>
              <Card>
                <TotpSection totpEnabled={account.totpEnabled} />
              </Card>
              <Card>
                <AccountSwitcher
                  current={{ id: userId, username, imageUrl }}
                  savedAccounts={savedAccounts}
                />
              </Card>
            </>
          )}

          {current.id === "appearance" && account && (
            <Card>
              <AppearanceForm
                theme={account.theme}
                themeColor={account.themeColor}
                background={account.background}
                customCss={account.customCss}
              />
            </Card>
          )}

          {current.id === "apps" && (
            <Card>
              <ConnectedAppsPanel grants={oauthGrants} />
            </Card>
          )}

          {current.id === "developer" && (
            <>
              <Card>
                <p className="text-sm text-muted">
                  Let people sign in to your own website or app with their Jace
                  account. Endpoints and the full API are on the{" "}
                  <Link href="/developers" className="underline underline-offset-2">
                    Developers page
                  </Link>
                  .
                </p>
              </Card>
              <Card>
                <OAuthAppsManager apps={oauthApps} />
              </Card>
            </>
          )}

          {current.id === "data" && account && (
            <>
              <DeleteDataSection userId={userId} />
              <DeleteAccountSection
                userId={userId}
                hasEmail={!!account.email}
                hasPassword={account.hasPassword}
              />
            </>
          )}

          {current.id === "admin" && showAdminPanel && (
            <>
              <Card>
                <AdminSettingsPanel admins={admins} />
              </Card>
              <Card>
                <h2 className="text-sm font-semibold">Bans and unbans by Jace apps</h2>
                <p className="mt-1 text-xs text-muted">
                  The latest moderation done through the app API (official apps only).
                </p>
                {moderationLog.length === 0 ? (
                  <p className="mt-3 text-sm text-muted">None yet.</p>
                ) : (
                  <ul className="mt-3 flex flex-col divide-y divide-black/10 text-sm dark:divide-white/15">
                    {moderationLog.map((entry) => (
                      <li key={entry.id} className="flex flex-wrap items-baseline gap-x-2 py-2">
                        <span className="font-medium">{entry.clientName}</span>
                        <span className={entry.action === "ban" ? "text-red-500" : "text-green-600 dark:text-green-500"}>
                          {entry.action === "ban" ? "banned" : "unbanned"}
                        </span>
                        <Link href={`/profile/${entry.targetUserId}`} className="underline underline-offset-2">
                          {entry.targetName ?? entry.targetUserId}
                        </Link>
                        {entry.reason && <span className="text-muted">: {entry.reason}</span>}
                        <span className="ml-auto text-xs text-muted">
                          {new Date(entry.createdAt).toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
