import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { getBaseUrl } from "@/lib/email";

export const metadata: Metadata = { title: "Developers · Jace" };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-black/[.04] p-3 font-mono text-xs leading-relaxed dark:bg-black/30">
      {children}
    </pre>
  );
}

export default function DevelopersPage() {
  const base = getBaseUrl();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10 text-sm">
      <div>
        <h1 className="text-2xl font-semibold">Developers</h1>
        <p className="mt-1 text-muted">
          One Jace account works across Jace Social, Jace Store, Jace Launcher,
          and the rest. Here&apos;s how an app plugs in. Jace is open source on{" "}
          <a href="https://github.com/okjace/jace" className="underline underline-offset-2">
            GitHub
          </a>
          .
        </p>
      </div>

      <Section title="Sign in with Jace">
        <p className="text-muted">
          Standard OAuth 2.0 (authorization code). Register your app in your
          profile&apos;s{" "}
          <Link href="/account/apps" className="underline underline-offset-2">
            account manager → Developer
          </Link>{" "}
          to get a <code>client_id</code> and <code>client_secret</code>.
        </p>
        <Code>{`Authorize  GET  ${base}/oauth/authorize?response_type=code&client_id=…&redirect_uri=…&scope=profile email&state=…
Token      POST ${base}/api/oauth/token      (code, redirect_uri, client_id, client_secret)
Userinfo   GET  ${base}/api/oauth/userinfo   (Authorization: Bearer <access_token>)`}</Code>
        <p className="text-muted">
          Userinfo returns <code>sub</code>, <code>username</code>,{" "}
          <code>picture</code>, <code>banned</code>, <code>muted</code>, and{" "}
          <code>email</code> with the email scope. Scopes: <code>profile</code>{" "}
          (always), <code>email</code>, and <code>messages</code> (official apps only).
        </p>
      </Section>

      <Section title="Official apps">
        <p className="text-muted">
          Apps registered by the site owner are Jace&apos;s own, marked{" "}
          <strong>Official</strong>. They sign people in without a consent
          screen, can ask for the <code>messages</code> scope, and can use the
          moderation API. People still see them under Connected apps and can
          disconnect them at any time.
        </p>
      </Section>

      <Section title="Messages (both directions)">
        <p className="text-muted">
          With a user&apos;s access token that has the <code>messages</code>{" "}
          scope, an official app can read that person&apos;s direct messages
          and group chats and send messages as them, for example to bring
          their Jace conversations into Jace Social or keep the two in sync.
        </p>
        <Code>{`GET  ${base}/api/oauth/messages
     → { direct: [{ user_id, username, last_message }], groups: [{ id, name, member_ids }] }

GET  ${base}/api/oauth/messages/dm/{userId}?since=2026-10-01T00:00:00Z
POST ${base}/api/oauth/messages/dm/{userId}
GET  ${base}/api/oauth/messages/groups/{groupId}?since=…
POST ${base}/api/oauth/messages/groups/{groupId}`}</Code>
        <p className="text-muted">
          POST one message as <code>{`{ "body": "hi" }`}</code>, or import up to
          500 at once as <code>{`{ "messages": [{ "body", "created_at", "external_id" }] }`}</code>.{" "}
          <code>created_at</code> keeps an imported message&apos;s original time,
          and <code>external_id</code> (your app&apos;s own message id) makes
          re-sending the same message a no-op, so syncing never duplicates. The
          response is <code>{`{ "imported": n, "skipped": n }`}</code>. Muted and
          banned accounts can&apos;t send.
        </p>
      </Section>

      <Section title="Moderation">
        <p className="text-muted">
          Server to server, with the official app&apos;s client credentials
          (HTTP Basic or <code>client_id</code>/<code>client_secret</code> in the
          body). Bans apply to the whole Jace account: the person can&apos;t sign
          in to Jace, and every app&apos;s access token for them stops working. Staff accounts can&apos;t be banned this way,
          and every ban and unban is logged with the app that made it.
        </p>
        <Code>{`POST ${base}/api/oauth/moderation
{ "action": "ban" | "unban" | "status", "user_id": "…" (or "username": "…"), "reason": "…" }
→ { user_id, username, banned, ban_reason, banned_at, muted }`}</Code>
      </Section>
    </div>
  );
}
