import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { auth } from "@/auth";
import { DOCS_FORUM_ID, NEWS_FORUM_ID, README_FORUM_ID, SUPPORT_ORG_ID, THEME_COLORS } from "@/lib/constants";
import { countOpenReports, getStoredUserById, getUnseenReadmeTopics, isAdmin, listTopicsByForum } from "@/lib/store";
import { AuthSessionProvider } from "@/components/providers/AuthSessionProvider";
import { Avatar } from "@/components/Avatar";
import { ModerationWatcher } from "@/components/moderation/ModerationWatcher";
import { BannedSupportView } from "@/components/moderation/BannedSupportView";
import { ReadmePopup } from "@/components/forums/ReadmePopup";
import { ReadmeWatcher } from "@/components/forums/ReadmeWatcher";
import { ThemeSync } from "@/components/providers/ThemeSync";
import type { StoredUser } from "@/lib/types";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Jace",
  description: "A company that makes stuff.",
};

/** CSS-escapes characters that could end a quoted string or the <style> tag. */
function cssString(value: string): string {
  return `"${value.replace(/["\\<\n\r]/g, (c) => `\\${c.charCodeAt(0).toString(16)} `)}"`;
}

/**
 * The account's color theme and custom background (Edit tab → Appearance)
 * as CSS. The doubled/tripled :root outranks globals.css's mode rules, and
 * a custom background color outranks the color theme.
 */
function appearanceCss(profile: StoredUser | null): string {
  const rules: string[] = [];
  const color = THEME_COLORS.find((c) => c.id === profile?.themeColor);
  if (color) {
    rules.push(
      `:root:root{--background:${color.light}}`,
      `:root:root[data-theme-pref="dark"]{--background:${color.dark}}`,
      `@media (prefers-color-scheme: dark){:root:root[data-theme-pref="system"]{--background:${color.dark}}}`,
    );
  }
  const bg = profile?.background;
  if (bg?.type === "color" && /^#[0-9a-f]{6}$/i.test(bg.color)) {
    rules.push(`:root:root:root{--background:${bg.color}}`);
  } else if (bg?.type === "image") {
    const fade = "color-mix(in srgb, var(--background) 75%, transparent)";
    const layers = [bg.fade ? `linear-gradient(${fade}, ${fade})` : null, `url(${cssString(bg.imageUrl)})`];
    rules.push(
      `body{background-image:${layers.filter(Boolean).join(", ")};background-size:cover;background-position:center;background-attachment:fixed}`,
    );
  }
  return rules.join("\n");
}

const NAV_LINKS = [
  { href: "/projects", label: "Projects" },
  { href: `/forums/${NEWS_FORUM_ID}`, label: "News" },
  { href: `/forums/${DOCS_FORUM_ID}`, label: "Docs" },
  { href: "/developers", label: "Developers" },
];

export default async function RootLayout({
  children,
}: LayoutProps<"/">) {
  const session = await auth();
  const profile = session?.user?.id ? await getStoredUserById(session.user.id) : null;
  const openReports =
    session?.user?.id && (await isAdmin(session.user.id)) ? await countOpenReports() : null;
  const unseenReadme =
    session?.user?.id && !profile?.banned ? await getUnseenReadmeTopics(session.user.id) : [];

  // Signed-out visitors get the popup too. With no account to record it on,
  // what they've dismissed is a cookie holding the newest topic time they saw.
  const signedOutSeen = session?.user?.id ? undefined : (await cookies()).get("readme_seen")?.value;
  const signedOutReadme = session?.user?.id
    ? []
    : (await listTopicsByForum(README_FORUM_ID)).filter(
        (t) => !signedOutSeen || Date.parse(t.createdAt) > Number(signedOutSeen),
      );

  // Signed-out visitors get dark, Jace Social's look; accounts use their own setting.
  const themePref = profile?.theme ?? "dark";
  // `<` can't appear in CSS outside strings, and inside one the escape means
  // the same character — so this keeps the text from closing the <style> tag.
  const customCss = profile?.customCss?.replace(/</g, "\\3c ");
  const themeCss = appearanceCss(profile);

  return (
    <html
      lang="en"
      data-theme-pref={themePref}
      // ThemeSync/the script below set data-theme on the client.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var p=${JSON.stringify(themePref)};var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light"})()`,
          }}
        />
        <ThemeSync pref={themePref} />
        <AuthSessionProvider>
          <header className="flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-panel px-6 py-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <Link href="/" className="text-lg font-semibold tracking-tight">
                Jace
              </Link>
              <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="text-zinc-600 transition-colors hover:text-foreground dark:text-zinc-400"
                  >
                    {link.label}
                  </Link>
                ))}
                {openReports !== null && (
                  <Link
                    href="/admin/reports"
                    className="text-zinc-600 transition-colors hover:text-foreground dark:text-zinc-400"
                  >
                    Reports{openReports > 0 ? ` (${openReports})` : ""}
                  </Link>
                )}
              </nav>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              {session?.user ? (
                <Link
                  href={`/profile/${session.user.id}`}
                  className="flex items-center gap-2 text-sm font-medium"
                >
                  <Avatar
                    name={session.user.name ?? "?"}
                    imageUrl={profile?.imageUrl}
                    size={28}
                  />
                  {session.user.name}
                </Link>
              ) : (
                <>
                  <Link href="/sign-in" className="text-sm font-medium">
                    Sign in
                  </Link>
                  <Link
                    href="/sign-up"
                    className="h-9 rounded-full bg-accent px-4 text-sm font-medium leading-9 text-on-accent transition-colors hover:bg-accent-hover"
                  >
                    Sign up
                  </Link>
                </>
              )}
            </div>
          </header>
          {profile?.banned && session?.user?.id ? (
            <BannedSupportView
              userId={session.user.id}
              userName={profile.username}
              userImageUrl={profile.imageUrl}
              banReason={profile.banReason}
            />
          ) : (
            <>
              {profile?.muted && (
                <div className="mx-auto w-full max-w-6xl px-6 pt-4">
                  <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
                    Your account is muted and can&apos;t post
                    {profile.muteReason ? `: ${profile.muteReason}` : "."} You can still browse, and{" "}
                    <Link href={`/dms/${SUPPORT_ORG_ID}`} className="underline underline-offset-2">
                      message Jace Official
                    </Link>{" "}
                    to appeal.
                  </p>
                </div>
              )}
              {children}
            </>
          )}
          {session?.user?.id && (
            <ModerationWatcher banned={!!profile?.banned} muted={!!profile?.muted} />
          )}
          {session?.user?.id && !profile?.banned && (
            <ReadmeWatcher unseenIds={unseenReadme.map((t) => t.id)} />
          )}
          {session?.user?.id && unseenReadme.length > 0 && (
            <ReadmePopup
              topics={unseenReadme}
              sawBefore={!!profile?.readmeSeenAt}
              account={{
                userId: session.user.id,
                hasEmail: !!profile?.email,
                hasPassword: !!profile?.passwordHash,
              }}
            />
          )}
          {!session?.user?.id && signedOutReadme.length > 0 && (
            <ReadmePopup
              topics={signedOutReadme}
              sawBefore={!!signedOutSeen}
              signedOutSeenMs={Math.max(...signedOutReadme.map((t) => Date.parse(t.createdAt)))}
            />
          )}
        </AuthSessionProvider>
        {themeCss && <style id="theme-css" dangerouslySetInnerHTML={{ __html: themeCss }} />}
        {customCss && (
          <>
            <style id="user-css" dangerouslySetInnerHTML={{ __html: customCss }} />
            {/* Escape hatch for CSS that breaks the page: visit any URL with ?nocss. */}
            <script
              dangerouslySetInnerHTML={{
                __html: `if(/[?&]nocss(=|&|$)/.test(location.search))document.getElementById("user-css")?.remove()`,
              }}
            />
          </>
        )}
      </body>
    </html>
  );
}
