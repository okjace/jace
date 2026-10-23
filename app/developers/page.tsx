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
          <code>picture</code>, <code>banned</code>, <code>muted</code>,{" "}
          <code>email</code> with the email scope, and, for official apps
          only, <code>is_admin</code> (whether the person is a Jace site
          admin). Scopes: <code>profile</code>{" "}
          (always), <code>email</code>, <code>scores</code>, <code>videos</code>, and{" "}
          <code>messages</code> (official apps only).
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

      <Section title="Profile">
        <p className="text-muted">
          An official app can change the signed-in person&apos;s Jace username
          and profile picture, for example so a new handle or avatar in Jace
          Social shows up on Jace too. Any token works (they all have the{" "}
          <code>profile</code> scope); other apps get{" "}
          <code>403 insufficient_scope</code>.
        </p>
        <Code>{`POST ${base}/api/oauth/profile
{ "username": "new_name", "picture": "https://…/avatar.png" }      (both optional; "picture": null removes it)
     → the userinfo body: { sub, username, name, picture, banned, muted, is_admin, … }`}</Code>
        <p className="text-muted">
          A username is 3-20 letters, numbers, or underscores, the same as in
          account settings; sending the current one changes nothing. The
          picture must be a public https URL of a PNG, JPEG, GIF (animated is
          fine), or WebP image, 4MB or smaller, reachable without redirects;
          Jace downloads it and keeps its own copy, so <code>picture</code> in
          the response is a Jace URL. Nothing is saved unless the whole request
          is valid. Errors: <code>400 invalid_request</code> (with an{" "}
          <code>error_description</code>), <code>409 username_taken</code>,{" "}
          <code>401 invalid_token</code>, <code>403 account_banned</code>, and{" "}
          <code>403 account_muted</code>.
        </p>
        <p className="text-muted">
          <strong>Profile webhooks.</strong> To keep a picture or username in
          step the other way, an official app can set a{" "}
          <strong>Profile webhook URL</strong> (Manage account → Developer).
          Whenever someone who has signed in to the app changes their Jace
          picture or username (on Jace, or through this endpoint), Jace POSTs:
        </p>
        <Code>{`{ "type": "user.updated", "user_id": "<Jace user id>", "changed": ["picture" | "username"], "sent_at": "<ISO time>" }`}</Code>
        <p className="text-muted">
          The request isn&apos;t signed, so don&apos;t trust it: re-read the
          person from Jace (<code>GET {base}/api/users/{"{user_id}"}</code>,
          public, or userinfo with their token) and update only if something
          actually changed. Answer quickly with any 2xx; Jace waits 5 seconds
          and doesn&apos;t retry. Pictures you send through this endpoint come
          back as Jace&apos;s own copy (a different URL); sending Jace its own
          current URL is a no-op, so syncing can&apos;t loop.
        </p>
      </Section>

      <Section title="Appeals">
        <p className="text-muted">
          Muted and banned accounts appeal by messaging the Jace Official
          organization. With a <code>messages</code> token belonging to Jace
          Official&apos;s owner or one of its admins, an official app can
          list those appeals, read each thread with the person&apos;s current
          ban or mute status, and reply as Jace Official. Anyone else gets{" "}
          <code>403 forbidden</code>. To lift a ban, use the moderation API
          below.
        </p>
        <Code>{`GET  ${base}/api/oauth/appeals
     → { appeals: [{ user_id, username, picture, status, ban_reason, banned_at,
                     mute_reason, muted_at, last_message }] }        (newest activity first)

GET  ${base}/api/oauth/appeals/{userId}?since=…
     → { user_id, username, picture, status, …, messages: [{ id, from_id, from_name, to_id, body, created_at }] }

POST ${base}/api/oauth/appeals/{userId}                             (reply as Jace Official)
     { "body": "…" }  or  { "messages": [{ "body", "created_at", "external_id" }] }
     → { "imported": n, "skipped": n }`}</Code>
        <p className="text-muted">
          <code>status</code> is <code>banned</code>, <code>muted</code>,{" "}
          <code>active</code> (the restriction was lifted), or{" "}
          <code>deleted</code>. In a thread, messages from the person have
          their own <code>from_id</code>; replies have Jace Official&apos;s.
        </p>
      </Section>

      <Section title="Scores">
        <p className="text-muted">
          With the <code>scores</code> scope, any app the person approves can
          read their game scores and the leaderboards; only official apps can
          save scores. A player&apos;s scores include the Snake and Memory Match
          scores from the old Jace site. Game ids are lowercase letters,
          numbers, and dashes (up to 32), and any id works, so a new game
          needs no setup on Jace.
        </p>
        <Code>{`GET  ${base}/api/oauth/scores?game=snake
     → { scores: [{ id, game, score, created_at }] }          (yours, newest first; game is optional)

GET  ${base}/api/oauth/leaderboard?game=snake&order=desc&limit=50
     → { scores: [{ user_id, username, picture, score, created_at }] }

POST ${base}/api/oauth/scores                                    (official apps only)
     { "game": "snake", "score": 42 }
  or { "scores": [{ "game", "score", "created_at", "external_id" }] }
     → { "imported": n, "skipped": n }`}</Code>
        <p className="text-muted">
          The leaderboard is each player&apos;s best score, with their current
          username and avatar, and leaves out banned accounts. Use{" "}
          <code>order=asc</code> for games where lower is better;{" "}
          <code>limit</code> is 50 by default and at most 100. A score is a
          whole number, 0 or more. Send up to 500 per request;{" "}
          <code>created_at</code> is optional and can&apos;t be in the future,
          and a score whose <code>external_id</code> your app already sent is
          skipped instead of saved twice.
        </p>
        <p className="text-muted">
          Errors are JSON: <code>401 invalid_token</code> for a missing,
          invalid, or expired token; <code>403 insufficient_scope</code> when
          the token lacks <code>scores</code> or a non-official app tries to
          save; <code>403 account_banned</code> for a banned account; and{" "}
          <code>400 invalid_request</code> for a bad request.
        </p>
      </Section>

      <Section title="Videos">
        <p className="text-muted">
          Videos now live in JaceTube, on top of this API, and include every
          video uploaded on the old Jace site. Public videos can be read with
          a user token that has the <code>videos</code> scope, or with just
          your app&apos;s client credentials (HTTP Basic) for people who
          haven&apos;t signed in. Uploading, editing, liking, and commenting
          need a user token from an official app.
        </p>
        <Code>{`GET    ${base}/api/oauth/videos?q=&user_id=&before=&limit=24
       → { videos: [{ id, title, description, url, thumbnail_url, content_type, size, visibility,
                      owner_id, owner_type, owner_name, owner_picture, likes, comment_count, created_at }],
           next_before }                                       (public only, newest first)
GET    ${base}/api/oauth/videos/mine                            (the user's own, every visibility)
GET    ${base}/api/oauth/videos/{id}                            → { video: { …, liked_by_me, can_manage, comments } }

POST   ${base}/api/oauth/videos/uploads                         (official apps)
       { "kind": "video" | "thumbnail", "filename", "content_type", "size" }
       → { path, upload_url, method: "PUT", headers, public_url }
POST   ${base}/api/oauth/videos
       { "path", "title", "description"?, "visibility"?, "thumbnail_path"?, "created_at"?, "external_id"? }
       → { video, created }
PATCH  ${base}/api/oauth/videos/{id}      { title?, description?, visibility?, thumbnail_path? }
DELETE ${base}/api/oauth/videos/{id}
POST   ${base}/api/oauth/videos/{id}/likes      (DELETE to unlike)
POST   ${base}/api/oauth/videos/{id}/comments   { "body": "…" }`}</Code>
        <p className="text-muted">
          To upload, ask for an upload URL, then send the file from the
          browser straight to <code>upload_url</code> as multipart form data
          (one field named <code>&quot;&quot;</code>) with the returned{" "}
          <code>headers</code>, then create the video with the{" "}
          <code>path</code>. Jace picks the path inside the user&apos;s own
          folder and checks the file is there. <code>visibility</code> is{" "}
          <code>public</code> (the default), <code>unlisted</code>, or{" "}
          <code>private</code>. For imports, <code>created_at</code> keeps the
          original date and <code>external_id</code> (your id, such as a
          YouTube video id) makes sending the same video again return the
          existing one with <code>created: false</code>.
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
