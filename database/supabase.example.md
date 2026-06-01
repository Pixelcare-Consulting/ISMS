# Supabase project setup

Do not store passwords or API keys in this repo. Use `.env.local` (gitignored).

## Environment variables

| Variable | Source |
|----------|--------|
| `DATABASE_URL` | Supabase → Settings → Database → Connection pooling (Session mode) |
| `DIRECT_URL` | Supabase → Settings → Database → Direct connection |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Project API keys (publishable) |
| `SUPABASE_SERVICE_ROLE_KEY` | Project API keys (service role, **server-only**) |

## Project metadata (non-secret)

- **Project name:** Finden-ISMS
- **Project ref:** `tykmapowjqsojzbrbqnm` (from dashboard URL)

## Policy attachments (Sprint 2b)

1. In Supabase → **Storage**, create a bucket named `policy-documents`.
2. Keep the bucket **private**; the app uses the service role to upload and download.
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.
4. Files are stored under `tenants/{tenantId}/policies/{policyId}/v{version}/…` with tenant checks in the app layer.

## Security

If a previous `database/supabase.md` contained a database password, rotate it in the Supabase dashboard.

## Migrations (Prisma)

1. `npm run db:migrate`
2. `npm run db:seed` — see [`seed-users.md`](./seed-users.md) for login credentials
3. Run `database/extensions.sql` in the Supabase SQL editor
