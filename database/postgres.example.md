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
| `STORAGE_ROOT` | Absolute uploads root for Docker (e.g. `/app/data/uploads`); omit locally to use `.data/uploads` |
| `STORAGE_DRIVER` | Optional. Default local-fs. Set `supabase` only to opt into Supabase Storage |
| `ALLOW_PUBLIC_REGISTER` | Set `true` to enable public `/register` (local/demo only; off by default) |
| `OPENAI_API_KEY` | Optional. Turns on ISMS Assist (Help questions + Dashboard briefing) |
| `AI_MODEL` | Optional OpenAI model id (default `gpt-4o-mini`) |
| `PIXELCARE_AI_USER_IDS` | Optional. Leave empty for all signed-in users. If set, comma-separated user ids/emails restrict access. Pixelcare AI is on by default |
| `PIXELCARE_AI_SAMPLE_MODE` | Optional. Set `true` for labeled sample fixtures only (no live tool mix) |
| `QWEN_API_KEY` | Optional. Model Studio / Qwen API key for Pixelcare AI |
| `QWEN_BASE_URL` | Optional. OpenAI-compatible base URL (`…/compatible-mode/v1`) |
| `QWEN_MODEL` | Optional. Qwen model id (default `qwen-plus`) |

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

Policy attachments and audit archives use the local filesystem by default (Docker/Ubuntu staging and local). Set absolute `STORAGE_ROOT` in Docker (e.g. `/app/data/uploads`); omit it locally to use `.data/uploads`. Supabase Storage is opt-in only via `STORAGE_DRIVER=supabase`.

## Migrations (Prisma)

1. `pnpm run db:migrate`
2. `pnpm run db:seed` — see [`seed-users.md`](./seed-users.md)
3. Run `database/extensions.sql` (see above)
