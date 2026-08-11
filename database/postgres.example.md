# Local Postgres setup (Docker)

Do not store passwords or API keys in this repo. Use `.env.local` (gitignored).

## Quick start

```bash
docker compose up -d
cp .env.example .env.local
# Edit AUTH_SECRET / BETTER_AUTH_SECRET if needed
pnpm install
pnpm run db:generate
pnpm run db:migrate
pnpm run db:seed
```

Run extensions once against local Postgres:

```bash
psql "postgresql://isms:isms@localhost:5432/isms" -f database/extensions.sql
```

Or with Docker:

```bash
docker compose exec -T postgres psql -U isms -d isms < database/extensions.sql
```

## Environment variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | App + Prisma Client connection (`localhost:5432`) |
| `DIRECT_URL` | Migrations / Prisma CLI (same as `DATABASE_URL` without a pooler) |
| `AUTH_SECRET` / `BETTER_AUTH_SECRET` | Session signing + SAP credential encryption |
| `BETTER_AUTH_URL` / `AUTH_URL` | App origin for Better Auth callbacks |
| `STORAGE_ROOT` | Local uploads root (default `.data/uploads`) |
| `ALLOW_PUBLIC_REGISTER` | Set `true` to enable public `/register` (local/demo only; off by default) |

Without a connection pooler, `DATABASE_URL` and `DIRECT_URL` can be identical.

## Stuck migrate locks

If `migrate dev` hits **P1002** advisory lock timeout after a crashed run:

```bash
pnpm run db:unlock
pnpm run db:migrate
```

Prefer `pnpm run db:deploy` in CI/production. Use `db:migrate` locally when creating new migration files.

## Cutover from hosted Postgres (e.g. former Supabase)

1. `pg_dump` the source database
2. Restore into Docker / local Postgres
3. Point `.env.local` `DATABASE_URL` / `DIRECT_URL` at the new host
4. Run `pnpm run db:deploy` for any pending migrations

No Prisma schema rewrite is required for connection cutover alone.

## Object storage

Policy attachments and audit archives use the local filesystem under `STORAGE_ROOT` (default `.data/uploads`). Paths stay `tenants/{tenantId}/…` so existing `storagePath` rows remain valid after switching off Supabase Storage.

## Migrations (Prisma)

1. `pnpm run db:migrate`
2. `pnpm run db:seed` — see [`seed-users.md`](./seed-users.md)
3. Run `database/extensions.sql` (see above)
