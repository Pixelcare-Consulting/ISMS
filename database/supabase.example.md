# Supabase project setup

Do not store passwords or API keys in this repo. Use `.env.local` (gitignored).

## Environment variables

| Variable | Source |
|----------|--------|
| `DATABASE_URL` | Supabase → Settings → Database → Connection pooling (Session mode, port **6543** or pooler host) |
| `DIRECT_URL` | Supabase → Settings → Database → **Direct connection** (host `db.<project-ref>.supabase.co`, port **5432**) — **not** the pooler URL |

**Important:** `pnpm run db:deploy` / `db:migrate` use `DIRECT_URL`.

### IPv4-only hosts (this dev server)

Direct host `db.<project-ref>.supabase.co` may not resolve (`ENOTFOUND`). Use the **session pooler** on port **5432** for `DIRECT_URL` (not port 6543).

`migrate dev` can still hit **P1002 advisory lock timeout** when stale locks remain from a crashed run. Fix:

```bash
pnpm run db:unlock          # clear stale Prisma locks
pnpm run db:migrate         # unlock + migrate dev (IPv4-safe)
pnpm run db:deploy          # apply pending migrations without shadow DB
```

Prefer `db:deploy` in CI/production. Use `db:migrate` locally when creating new migration files.
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
