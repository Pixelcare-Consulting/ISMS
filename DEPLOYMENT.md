# Self-hosted deployment (Docker)

Replaces the Vercel deployment. One Compose stack per server:

| Service | Image | Role |
|---------|-------|------|
| `traefik` | `traefik:v3.1` | Reverse proxy, HTTP→HTTPS redirect, Let's Encrypt certs |
| `postgres` | `postgres:16-alpine` | Database (loopback port 5432 for `psql`/`pg_dump` from the host) |
| `postgres-backup` | `prodrigestivill/postgres-backup-local:16` | Scheduled dumps into `./backups/postgres` |
| `migrator` | app image | One-shot `prisma migrate deploy`; `app` starts only after it succeeds |
| `app` | app image (`Dockerfile`) | Next.js standalone server on :3000 |
| `cron` | `curlimages/curl` | Calls `/api/cron/sap-sync` every 5 min (replaces the `vercel.json` cron) |

Portainer (`docker-compose.portainer.yml`) is deployed separately so redeploying the app never takes the management UI down.

## Server prerequisites

- Docker Engine 24+ with the Compose plugin (`docker compose version`)
- DNS `A` record for `APP_DOMAIN` pointing at the server; ports 80 and 443 open (Let's Encrypt HTTP challenge)
- Outbound access to SAP Service Layer, Resend, OpenAI etc. as needed

## First deploy

```bash
git clone https://github.com/Pixelcare-Consulting/ISMS.git && cd ISMS

cp .env.production.example .env.production
# Fill in: APP_DOMAIN, LETSENCRYPT_EMAIL, NEXT_PUBLIC_APP_URL, BETTER_AUTH_URL, AUTH_URL,
# AUTH_SECRET / BETTER_AUTH_SECRET, BETTER_AUTH_API_KEY, CRON_SECRET,
# POSTGRES_PASSWORD + the matching DATABASE_URL / DIRECT_URL

touch traefik/acme.json && chmod 600 traefik/acme.json

docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

`--env-file` matters: Compose reads `${APP_DOMAIN}`, build args and `APP_IMAGE` from it; `env_file:` inside the file only feeds the containers.

First-time database setup after the stack is healthy:

```bash
# optional extension(s) — uuid-ossp ships with the image; pgvector is not used by any migration
docker compose -f docker-compose.prod.yml exec -T postgres psql -U isms -d isms -c 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";'

# seed core data (tenant, roles, permissions) — same profiles as `pnpm run db:seed:*`
docker compose -f docker-compose.prod.yml run --rm app pnpm exec prisma db seed
```

Migrating data off the hosted database: `pg_dump` the source, `psql -h 127.0.0.1 -U isms isms < dump.sql` on the server, then `docker compose ... up -d` (the migrator applies anything pending).

## Releases

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

`up --build` rebuilds the image, runs the migrator, and recreates `app` only if the image changed. To use a registry instead of building on the server, push the image from CI and set `APP_IMAGE=ghcr.io/…/isms:<tag>` in `.env.production`.

`NEXT_PUBLIC_*` values are baked in at build time — changing `NEXT_PUBLIC_APP_URL` requires a rebuild, not just a restart. Everything else (including `MAINTENANCE_MODE`) is read when the container starts: edit `.env.production`, then `docker compose ... up -d` to recreate `app`.

## Operations

```bash
# logs
docker compose -f docker-compose.prod.yml logs -f app
docker compose -f docker-compose.prod.yml logs cron        # sap-sync failures show here

# health
curl -s https://$APP_DOMAIN/api/health                     # {"status":"ok"} / 503 when DB unreachable

# run migrations manually / other Prisma commands
docker compose -f docker-compose.prod.yml run --rm migrator
docker compose -f docker-compose.prod.yml run --rm app pnpm exec prisma migrate status

# database shell
docker compose -f docker-compose.prod.yml exec postgres psql -U isms -d isms

# manual backup / restore
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U isms isms | gzip > isms-$(date +%F).sql.gz
gunzip -c isms-YYYY-MM-DD.sql.gz | docker compose -f docker-compose.prod.yml exec -T postgres psql -U isms -d isms
```

Persistent data lives in two named volumes: `isms-production_postgres-data` and `isms-production_uploads-data` (policy attachments and audit archives, `STORAGE_ROOT=/app/.data/uploads`). Back up both.

## Differences from Vercel

- **Storage**: `src/lib/storage` uses the local filesystem whenever `VERCEL` is unset, so Supabase Storage is no longer required. Existing attachments in Supabase must be copied into the `uploads-data` volume manually if they need to stay reachable.
- **Cron**: driven by the `cron` sidecar, authenticated with `CRON_SECRET`. There is no 300 s function limit; the route still budgets 240 s per run by design.
- **Redis**: the app talks to Upstash over REST (`@upstash/redis`), so a Redis container would be unused. Leave `UPSTASH_*` unset (in-memory fallback) or keep the Upstash account.
- **Trusted origins**: Better Auth trusts `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` plus the request's `X-Forwarded-Host`, which Traefik sets — no extra config needed.
- `vercel.json` can be deleted once Vercel is decommissioned; nothing in the container reads it.

## LAN-only hosting (no public domain)

Let's Encrypt cannot issue certificates for hosts it cannot reach. Either put a company wildcard cert into Traefik via a file provider, or drop TLS and serve plain HTTP: change the `app` labels to `entrypoints=web`, remove the `tls.certresolver` label, and delete the two `redirections.*` lines from the Traefik command. Set `BETTER_AUTH_URL`/`NEXT_PUBLIC_APP_URL` to the `http://` origin in that case.
