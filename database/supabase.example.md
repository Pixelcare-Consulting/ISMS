# Supabase project setup

Do not store passwords or API keys in this repo. Use `.env.local` (gitignored).

## Environment variables

| Variable | Source |
|----------|--------|
| `DATABASE_URL` | Supabase → Settings → Database → Connection pooling (Session mode, port **6543** or pooler host) |
| `DIRECT_URL` | Supabase → Settings → Database → **Direct connection** (host `db.<project-ref>.supabase.co`, port **5432**) — **not** the pooler URL |

**Important:** `pnpm run db:deploy` / `db:migrate` use `DIRECT_URL`. If `DIRECT_URL` contains `pooler.supabase.com`, migrations will fail with `P1002` advisory lock timeout.
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
