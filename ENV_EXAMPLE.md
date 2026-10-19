# Environment variables

Set these (e.g. in `.env.local`) before running:

- `DATABASE_URL` — Neon/Postgres connection string (schema in `lib/schema.sql`)
- `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` — NextAuth
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — file storage
- `MAILJET_API_KEY`, `MAILJET_API_SECRET`, `EMAIL_FROM` — transactional email
- `NEXT_PUBLIC_APP_URL` — public site URL

Also set the two placeholder ids in `lib/constants.ts`.
