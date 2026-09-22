# ISMS deployment — development, staging, production

Self-hosted Docker setup replacing Vercel. **One image, three environments**: the
image built from a commit is promoted unchanged from development → staging →
production; only the env file differs.

## The three environments

| | **development** | **staging** (pre-prod) | **production** |
|---|---|---|---|
| Purpose | Build & run the container exactly as it will ship; day-to-day dev DB | Client acceptance / UAT on real-shaped data; last stop before prod | Live system |
| Where | Your laptop (or any dev box) | Finden server | Finden server |
| Git source | `develop` branch (and your working tree) | `main` branch | `vX.Y.Z` tag on `main` |
| Image | Built locally (`--build`) or pulled `ghcr.io/…/isms:develop` | `ghcr.io/…/isms:sha-<commit>` published by CI | Same `sha-<commit>` image, also tagged `vX.Y.Z` + `latest` |
| Deploy trigger | Manual (`deploy/stack.sh dev up -d --build`) | **Automatic** on every push to `main` | **Approval-gated** on tag push (GitHub environment reviewers) |
| Ingress | `http://localhost:3000`, no TLS | Traefik + Let's Encrypt on `APP_DOMAIN` | Traefik + Let's Encrypt on `APP_DOMAIN` |
| Database | `postgres` container, host port 5432 (reuses old `isms_pg_data` volume) | `postgres` container, host port 5433 | `postgres` container, host port 5434 + nightly dumps |
| SAP cron | Off (opt-in `--profile cron`) | On | On |
| Files | `docker-compose.yml` + `docker-compose.dev.yml`, `.env.dev` | `… + docker-compose.staging.yml`, `.env.staging` | `… + docker-compose.prod.yml`, `.env.prod` |

Everything is driven through one wrapper:

```bash
deploy/stack.sh <dev|staging|prod> <any docker compose args>
```

It selects `.env.<env>` and layers `docker-compose.<env>.yml` over the shared
`docker-compose.yml`. `deploy/stack.sh prod config` prints the merged result.

## Pipeline (`.github/workflows/ci.yml`)

```
PR → develop/main ─ lint · typecheck · prisma checks · image build (not pushed)
push develop ──────┐
push main ─────────┼─ same checks ─ push image to GHCR ─┬─ (develop) done
tag vX.Y.Z ────────┘                                    ├─ (main)    deploy → staging
                                                         └─ (tag)     wait for approval → deploy → production
workflow_dispatch ── deploy any published tag to staging or production (promote / rollback)
```

Deploy = SSH to the server → `git checkout <commit>` (so compose files match) →
`docker login ghcr.io` → `deploy/release.sh <env> <image>` → public `/api/health`.
`release.sh` pulls, runs the `migrator`, recreates `app`, waits for the Docker
HEALTHCHECK, and restores the previous image if the new one never becomes healthy.

### One-time GitHub setup

Settings → Environments → create **`staging`** and **`production`** (production:
tick *Required reviewers*). On each, set:

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

# 1. Shared proxy (serves both staging and prod)
cp .env.traefik.example .env.traefik              # LETSENCRYPT_EMAIL
touch traefik/acme.json && chmod 600 traefik/acme.json
docker compose --env-file .env.traefik -f docker-compose.traefik.yml up -d

# 2. Portainer (optional management UI)
docker compose -f docker-compose.portainer.yml up -d

# 3. Environment files — fill every empty value
cp .env.staging.example .env.staging
cp .env.prod.example    .env.prod

# 4. Registry access for pulls
docker login ghcr.io -u <github-user>            # PAT with read:packages

# 5. First rollout (then CI takes over)
deploy/release.sh staging ghcr.io/pixelcare-consulting/isms:main
deploy/release.sh prod    ghcr.io/pixelcare-consulting/isms:latest

# 6. Seed core data (tenant, roles, permissions) — once per fresh database
deploy/stack.sh staging run --rm app ./node_modules/.bin/prisma db seed
```

Both stacks share the server safely: distinct project names (`isms-staging`,
`isms-prod`), volumes, internal networks and Postgres host ports; only Traefik
is shared, and it routes by `APP_DOMAIN`.

## Local development

```bash
cp .env.dev.example .env.dev
deploy/stack.sh dev up -d --build         # whole stack → http://localhost:3000
deploy/stack.sh dev up -d postgres        # DB only, then `pnpm dev` on the host (.env.local)
APP_IMAGE=ghcr.io/pixelcare-consulting/isms:develop deploy/stack.sh dev up -d --pull always
deploy/stack.sh dev --profile cron up -d  # also run the SAP sync sidecar
```

`.env.dev` is intentionally *not* named `.env.development`: Next.js auto-loads
that name into `next dev`/`next build`, which would pull container hostnames
like `postgres:5432` into your host run. Use `.env.local` for `pnpm dev`.

## Day-to-day operations

```bash
deploy/stack.sh prod ps
deploy/stack.sh prod logs -f app
deploy/stack.sh prod logs cron                       # sap-sync failures
curl -s https://$APP_DOMAIN/api/health               # {"status":"ok"} or 503

deploy/stack.sh prod run --rm migrator               # re-run migrations
deploy/stack.sh prod run --rm app ./node_modules/.bin/prisma migrate status
deploy/stack.sh prod exec postgres psql -U isms -d isms

# manual backup / restore (prod also dumps nightly to ./backups/postgres)
deploy/stack.sh prod exec postgres pg_dump -U isms isms | gzip > isms-$(date +%F).sql.gz
gunzip -c isms-YYYY-MM-DD.sql.gz | deploy/stack.sh prod exec -T postgres psql -U isms -d isms

# roll back / promote a specific image without CI
deploy/release.sh prod ghcr.io/pixelcare-consulting/isms:v1.3.0
```

Persistent data per environment: volumes `isms-<env>_postgres-data` and
`isms-<env>_uploads-data` (policy attachments, audit archives — `STORAGE_ROOT=/app/data/uploads`).
Back up both.

Config changes: edit `.env.<env>`, then `deploy/stack.sh <env> up -d` (recreates
`app`). `MAINTENANCE_MODE=true` is a runtime switch. Nothing needs a rebuild
except `NEXT_PUBLIC_SUPPORT_EMAIL`.

## Releasing to production

```bash
git checkout main && git pull
git tag v1.4.0 && git push origin v1.4.0     # CI builds, publishes, then waits for approval
```

Approve the `production` deployment in the Actions run. The deployed image is
the `sha-<commit>` build of that tag — identical bytes to what staging ran.

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
