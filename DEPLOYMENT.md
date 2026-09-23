# ISMS deployment — develop & staging

Self-hosted Docker setup replacing Vercel. **One image, three environments**: the
image built from a commit is promoted unchanged from develop → staging →
staging (and later production); only the env file differs.

> **Production is not set up yet.** Everything below covers `develop` and
> `staging`. See [Adding production later](#adding-production-later).

## The three environments

| | **develop** | **staging** (pre-production) |
|---|---|---|---|
| Purpose | Build & run the container exactly as it will ship; day-to-day dev DB | Client acceptance / UAT on real-shaped data; last stop before prod | Live system |
| Where | Your laptop (or any dev box) | Finden server | Finden server |
| Git branch | `develop` (and your working tree) | `staging` |
| Image | Built locally (`--build`) or pulled `ghcr.io/…/isms:develop` | `ghcr.io/…/isms:sha-<commit>` published by CI (alias `:staging`) |
| Deploy trigger | Manual (`deploy/stack.sh develop up -d --build`) | **Automatic** on every push to `staging` |
| Ingress | `http://localhost:3000`, no TLS | Traefik + Let's Encrypt on `APP_DOMAIN` | Traefik + Let's Encrypt on `APP_DOMAIN` |
| Database | `postgres` container, host port 5432 (reuses old `isms_pg_data` volume) | `postgres` container, host port 5433 | `postgres` container, host port 5434 + nightly dumps |
| SAP cron | Off (opt-in `--profile cron`) | On | On |
| Files | `docker-compose.yml` + `docker-compose.develop.yml`, `.env.develop` | `… + docker-compose.staging.yml`, `.env.staging` |

Everything is driven through one wrapper:

```bash
deploy/stack.sh <develop|staging> <any docker compose args>
```

It selects `.env.<env>` and layers `docker-compose.<env>.yml` over the shared
`docker-compose.yml`. `deploy/stack.sh staging config` prints the merged result.

## Pipeline (`.github/workflows/ci.yml`)

```
feature/* ──PR──▶ develop ──PR/merge──▶ staging

PR → either branch ─ lint · typecheck · unit tests · prisma checks · image build (not pushed) · e2e against that image
push develop ──┐
push staging ──┴─ same checks ─ push image to GHCR ─┬─ (develop) done — pull it locally
                                                     └─ (staging) deploy → staging
workflow_dispatch ── deploy any published tag to staging (promote / rollback)
```

Branch protection worth turning on: PRs required into `staging`.

Deploy = SSH to the server → `git checkout <commit>` (so compose files match) →
`docker login ghcr.io` → `deploy/release.sh <env> <image>` → public `/api/health`.
`release.sh` pulls, runs the `migrator`, recreates `app`, waits for the Docker
HEALTHCHECK, and restores the previous image if the new one never becomes healthy.

### One-time GitHub setup

Settings → Environments → create **`staging`** (optionally restrict it to the
`staging` branch under *Deployment branches*, and tick *Required reviewers* if
you want deploys to pause for approval). On it, set:

| Kind | Name | Value |
|---|---|---|
| Variable | `DEPLOY_ENABLED` | `true` (flip to anything else to freeze deploys) |
| Variable | `PUBLIC_APP_URL` | `https://<APP_DOMAIN>` |
| Secret | `SSH_HOST`, `SSH_PORT`, `SSH_USER`, `SSH_PRIVATE_KEY`, `SSH_HOST_FINGERPRINT` | Server access (`ssh-keyscan -t ed25519 host` → SHA256 fingerprint) |
| Secret | `DEPLOY_PATH` | e.g. `/srv/isms` — the clone on the server |
| Secret | `GHCR_USERNAME`, `GHCR_PULL_TOKEN` | A PAT with `read:packages` so the server can pull the private image |

Repo-level variable (optional): `NEXT_PUBLIC_SUPPORT_EMAIL` — the only value
baked into the image at build time.

## Server setup (Finden) — once per server

```bash
# Docker Engine 24+ with compose plugin, ports 80/443 open, DNS A records → server
sudo git clone https://github.com/Pixelcare-Consulting/ISMS.git /srv/isms && cd /srv/isms

# 1. Shared proxy (later also serves production)
nano .env.traefik                                 # LETSENCRYPT_EMAIL=…
touch traefik/acme.json && chmod 600 traefik/acme.json
docker compose --env-file .env.traefik -f docker-compose.traefik.yml up -d

# 2. Portainer (optional management UI)
docker compose -f docker-compose.portainer.yml up -d

# 3. Environment file — create .env.staging from the variable list below
#    (values are kept outside the repo)
nano .env.staging && chmod 600 .env.staging

# 4. Registry access for pulls
docker login ghcr.io -u <github-user>            # PAT with read:packages

# 5. First rollout (then CI takes over)
deploy/release.sh staging ghcr.io/pixelcare-consulting/isms:staging

# 6. Seed core data (tenant, roles, permissions) — once per fresh database
deploy/stack.sh staging run --rm app ./node_modules/.bin/prisma db seed
```

Stacks share a server safely: distinct project names (`isms-staging`, and later
`isms-production`), volumes, internal networks and Postgres host ports; only
Traefik is shared, and it routes by `APP_DOMAIN`.

## Local development (the `develop` environment)

```bash
# create .env.develop (variable list below; values kept outside the repo)
deploy/stack.sh develop up -d --build         # whole stack → http://localhost:3000
deploy/stack.sh develop up -d postgres        # DB only, then `pnpm dev` on the host (.env.local)
APP_IMAGE=ghcr.io/pixelcare-consulting/isms:develop deploy/stack.sh develop up -d --pull always
deploy/stack.sh develop --profile cron up -d  # also run the SAP sync sidecar
```

`.env.develop` is intentionally *not* named `.env.development`: Next.js auto-loads
that name into `next dev`/`next build`, which would pull container hostnames
like `postgres:5432` into your host run. Use `.env.local` for `pnpm dev`.

## Environment variables

Env files (`.env.develop`, `.env.staging`, `.env.traefik`) are
**never committed** and hold no example values in this repo. `deploy/stack.sh`
passes the file both as `--env-file` (Compose `${VAR}` interpolation) and
`env_file:` (into the containers). Variables the stack reads:

- Compose: `APP_IMAGE` (required on staging), `APP_DOMAIN` (staging), `APP_HOST_PORT` (develop), `POSTGRES_HOST_PORT` (unique per env on a shared server)
- App URL / auth: `APP_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `AUTH_SECRET`, `BETTER_AUTH_API_KEY`, `ALLOW_PUBLIC_REGISTER`, `AUTH_RATE_LIMIT_ENABLED` (only ever `false` in the CI e2e stack)
- Database: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL`, `DIRECT_URL` (host is the compose service `postgres`)
- Integrations: `CRON_SECRET`, `SAP_ENCRYPTION_KEY`, `SAP_*` tuning, `RESEND_API_KEY`, `EMAIL_FROM`, `OPENAI_API_KEY`, `AI_MODEL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- Operations: `MAINTENANCE_MODE`, `LOG_LEVEL`, `SENTRY_DSN`, `SLOW_QUERY_MS`, `PRISMA_LOG_QUERIES`, `AUDIT_LOG_HOT_DAYS`
- Traefik: `LETSENCRYPT_EMAIL`

Values, defaults and per-environment differences live outside the repo (ask the
maintainer). `grep -rhoE 'process\.env\.[A-Z0-9_]+' src` is the source of truth.

## Day-to-day operations

```bash
deploy/stack.sh staging ps
deploy/stack.sh staging logs -f app
deploy/stack.sh staging logs cron                       # sap-sync failures
curl -s https://$APP_DOMAIN/api/health               # {"status":"ok"} or 503

deploy/stack.sh staging run --rm migrator               # re-run migrations
deploy/stack.sh staging run --rm app ./node_modules/.bin/prisma migrate status
deploy/stack.sh staging exec postgres psql -U isms -d isms

# manual backup / restore
deploy/stack.sh staging exec postgres pg_dump -U isms isms | gzip > isms-$(date +%F).sql.gz
gunzip -c isms-YYYY-MM-DD.sql.gz | deploy/stack.sh staging exec -T postgres psql -U isms -d isms

# roll back / promote a specific image without CI
deploy/release.sh staging ghcr.io/pixelcare-consulting/isms:sha-<previous commit>
```

Persistent data per environment: volumes `isms-<develop|staging>_postgres-data` and
`isms-<develop|staging>_uploads-data` (policy attachments, audit archives — `STORAGE_ROOT=/app/data/uploads`).
Back up both.

Config changes: edit `.env.<env>`, then `deploy/stack.sh <env> up -d` (recreates
`app`). `MAINTENANCE_MODE=true` is a runtime switch. Nothing needs a rebuild
except `NEXT_PUBLIC_SUPPORT_EMAIL`.

## Promoting

```bash
# develop → staging (auto-deploys staging)
gh pr create --base staging --head develop --title "Promote to staging"   # or merge in GitHub
```

## Adding production later

Everything is built so production is additive, not a rewrite. When the client
signs off on staging:

1. `git checkout -b production staging && git push -u origin production`
2. Restore the production Compose override:
   `git show 2edb4b5:docker-compose.production.yml > docker-compose.production.yml`
   (it is the staging override plus a nightly `postgres-backup` sidecar)
3. Add `production` to the trigger lists, the `workflow_dispatch` choice and the
   `target` job's branch cases in `.github/workflows/ci.yml`, and to the `case`
   statements in `deploy/stack.sh` and `deploy/release.sh`
4. On the server: second DNS record, `.env.production` (own `APP_DOMAIN`,
   `POSTGRES_HOST_PORT=5434`, fresh secrets), `deploy/release.sh production …`
5. On GitHub: a `production` environment with *Required reviewers* and the same
   secrets/vars as staging

The image never changes — production pulls the same `sha-…` tag staging ran.

## Differences from Vercel

- **Storage**: `src/lib/storage` uses the local filesystem whenever `VERCEL` is unset; Supabase Storage is no longer required.
- **Cron**: the `cron` sidecar calls `/api/cron/sap-sync` with `CRON_SECRET` every 5 min.
- **Redis**: the app talks to Upstash over REST only; there is no Redis container. Leave `UPSTASH_*` unset for the in-memory fallback.
- **URL**: `APP_URL` (runtime) replaces `NEXT_PUBLIC_APP_URL` (build-time) for auth trusted origins and email links.
- `vercel.json` can be deleted once Vercel is decommissioned.

## LAN-only hosting (no public domain)

Let's Encrypt cannot reach a private host. Either load a company certificate
into Traefik via a file provider, or serve plain HTTP: in the env's override
change the router to `entrypoints=web`, drop the `tls.certresolver` label, and
remove the two `redirections.*` lines from `docker-compose.traefik.yml`. Set
`APP_URL`/`BETTER_AUTH_URL` to the `http://` origin.
