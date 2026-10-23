# Environment variables

Set these (e.g. in `.env.local`) before running:

- `DATABASE_URL` — Neon/Postgres connection string (schema in `lib/schema.sql`)
- `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` — NextAuth
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — file storage
- Transactional email, first one set wins (see `lib/email.ts`):
  - `MAKE_EMAIL_WEBHOOK_URL` (+ optional `MAKE_EMAIL_WEBHOOK_KEY`): a Make.com scenario whose Custom webhook receives `{ to, subject, html, text }` and sends it, e.g. with Microsoft 365 Email (Outlook), ending in a Webhook response (200)
  - `RESEND_API_KEY` + `EMAIL_FROM` (on a domain verified in Resend)
  - `MAILJET_API_KEY`, `MAILJET_API_SECRET`, `EMAIL_FROM`
- `NEXT_PUBLIC_APP_URL` — public site URL

Also set the two placeholder ids in `lib/constants.ts`.
