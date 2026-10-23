# Jace

**A company that makes stuff.** Live at [jaceo.vercel.app](https://jaceo.vercel.app).

Jace is the home of the Jace apps: Jace Social, Jace Launcher, Jace Store, BlidOS, Profile Maker, VLC Redesign, and more. This repo is the website, which:

- lists the projects on its home page (the owner edits them from each project's page), and can sync a project from its GitHub repo (description, website, README, and releases as versions)
- runs **Jace accounts**, with a tabbed account manager: profile, account, security, appearance (themes, color themes, custom backgrounds, custom CSS), connected apps, developer apps, and your data
- provides **Sign in with Jace** (OAuth 2.0) so one account works in every app
- gives apps a **scores API** (read a player's game scores and the leaderboards; official apps like Jace Games can also save scores)
- gives Jace's own ("official") apps a **messages API** (read and write a user's messages, with their permission), a **profile API** (change a user's username and picture from apps like Jace Social), a **moderation API** (ban and unban accounts), and an **appeals API** so Jace Official's staff can read and answer ban appeals from apps like Jace Social.
- gives apps a **videos API** (the old Jace videos, for apps like JaceTube), lets official apps change a user's username and picture, and sends official apps a **profile webhook** when someone's Jace picture or username changes See the site's [Developers page](https://jaceo.vercel.app/developers).

Older community features (videos, games, chat, messages, Cloud, organizations, open forums) are still in the code but hidden by `proxy.ts`; their data is kept.

**Built by Claude, made by Anthropic.**

Built with Next.js (App Router), React, TypeScript, Tailwind, NextAuth, Neon Postgres, and Supabase Storage.

## Running it

```bash
npm install
npm run dev
```

See `ENV_EXAMPLE.md` for the environment variables you need, and `lib/schema.sql` for the database schema. Set `ROOT_ADMIN_ID` and `SUPPORT_ORG_ID` in `lib/constants.ts` to your own owner account and support organization.

## License

[MIT](LICENSE)
