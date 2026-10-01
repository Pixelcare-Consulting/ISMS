# ISMS deployment — develop & staging

Self-hosted Docker setup replacing Vercel. **Two deployed environments on the
Finden server**, both live and both fed by the same pipeline: the image built
from a commit is promoted unchanged from develop → staging; only the env file
differs.

> **Production is not set up yet.** See [Adding production later](#adding-production-later).

## Environments

| | **develop** | **staging** | **sandbox** |
|---|---|---|---|
| Purpose | **Internal testing** — the team tries merged work on a real URL | **Client QA / UAT** — what the client is shown | Not deployed: the stack in containers on a laptop or CI runner |
| Where | Finden server (`ismsv2`) | Finden server (`ismsv2`) | Your machine / GitHub Actions |
| Git branch | `develop` | `staging` | none — your working tree |
| Image | `ghcr.io/…/isms:sha-<commit>` published by CI (alias `:develop`) | the same `sha-<commit>` image after the merge (alias `:staging`) | built locally, or any tag you pull |
| Deploy trigger | **Automatic** on every push to `develop` | **Automatic** on every push to `staging` | Manual (`deploy/stack.sh sandbox up -d --build`) |
| Ingress | Traefik + Let's Encrypt on `APP_DOMAIN` | Traefik + Let's Encrypt on `APP_DOMAIN` | `http://localhost:3000`, no TLS |
| Postgres host port | 5433 | 5434 | 5432 |
| SAP cron | On | On | Off (opt-in `--profile cron`) |
| Override file | `docker-compose.develop.yml`, `.env.develop` | `docker-compose.staging.yml`, `.env.staging` | `docker-compose.sandbox.yml`, `.env.sandbox` |

`develop` and `staging` are identical in shape — same services, same Traefik,
same health-gated rollout. They differ only in domain, database and secrets, so
a change that works on develop behaves the same way for the client on staging.

Everything is driven through one wrapper:

```bash
deploy/stack.sh <sandbox|develop|staging> <any docker compose args>
```

It selects `.env.<env>` and layers `docker-compose.<env>.yml` over the shared
`docker-compose.yml`. `deploy/stack.sh staging config` prints the merged result.

> `.env.sandbox`, not `.env.local`: Next.js reserves `.env.local` for `pnpm dev`
> on the host, and container hostnames like `postgres:5432` must not leak into it.

## Pipeline (`.github/workflows/ci.yml`)

```
feature/* ──PR──▶ develop ──PR/merge──▶ staging
                    │                      │
                    ▼                      ▼
             internal testing          client QA

PR → either branch ─ lint · typecheck · unit tests · prisma checks · image build (not pushed) · e2e against that image
push develop ──┐
push staging ──┴─ same checks ─ push image to GHCR ─┬─ (develop) deploy → develop
                                                     └─ (staging) deploy → staging
workflow_dispatch ── deploy any published tag to develop or staging (promote / rollback)
```

Branch protection worth turning on: PRs required into `develop` and `staging`.

Deploy runs **on the server**, through a GitHub self-hosted runner installed
there (labels `isms-develop`, `isms-staging`). The runner polls GitHub over
outbound HTTPS, so the server needs **no inbound SSH**. The client's network
keeps port 22 closed.

1. **`deploy` job (self-hosted runner, on the server):** `git checkout <commit>`
   in `DEPLOY_PATH` (so compose files match; fetched with the job's
   `GITHUB_TOKEN`, so it works on a private repo too) → `docker login ghcr.io` →
   `deploy/release.sh <env> <image>`. `release.sh` pulls, runs the `migrator`,
   recreates `app`, waits for the Docker HEALTHCHECK, and restores the previous
   image if the new one never becomes healthy.
2. **`verify` job (GitHub-hosted):** `curl <PUBLIC_APP_URL>/api/health` from
   outside. This proves the site is reachable from the internet, which the
   server can't test itself: the client's router has no NAT loopback.

### One-time GitHub setup

Settings → Environments → create **`develop`** and **`staging`**. Restrict each
to its own branch under *Deployment branches*, and tick *Required reviewers* on
`staging` if you want client-facing deploys to pause for approval.

Set the following on **each** environment — same names, different values:

| Kind | Name | Value |
|---|---|---|
| Variable | `DEPLOY_ENABLED` | `true` (flip to anything else to freeze deploys) |
| Variable | `PUBLIC_APP_URL` | `https://<that environment's APP_DOMAIN>` |
| Secret | `DEPLOY_PATH` | e.g. `/srv/isms` — the clone on the server |
| Secret | `GHCR_USERNAME`, `GHCR_PULL_TOKEN` | A PAT with `read:packages` so the server can pull the private image |

Repo-level variable (optional): `NEXT_PUBLIC_SUPPORT_EMAIL` — the only value
baked into the image at build time.

**The repo is public, and self-hosted runners run whatever a workflow tells
them to.** Keep *Settings → Actions → General → Fork pull request workflows* on
**"Require approval for all external contributors"**, and never approve a
fork PR's workflow run without reading its changes. Making the repo private
removes this risk entirely. Deploys already authenticate for that case.

## Server setup (Finden) — once per server

Network prerequisites, done by the **client's infra team** (not on the server):
- A DNS A record per environment domain → the public IP.
- A port forward on their firewall: public IP **80 and 443** → the server's
  LAN IP (`hostname -I` on the server, first address). Inbound 22 isn't needed.
- For people **inside** the client's office to open the site: NAT loopback
  (hairpin NAT) on the firewall, or an internal DNS record → the LAN IP.

```bash
# Docker Engine 24+ with compose plugin; run as root
git clone https://github.com/Pixelcare-Consulting/ISMS.git /srv/isms && cd /srv/isms

# 0. Host firewall (Ubuntu ufw is on by default with only 22 allowed)
ufw allow 80/tcp && ufw allow 443/tcp

# 1. Shared proxy (serves both app stacks, and later production).
#    Docker Engine 29+ needs Traefik >= 3.6 (older releases fail with
#    "client version 1.24 is too old").
nano .env.traefik                                 # LETSENCRYPT_EMAIL=…
touch traefik/acme.json && chmod 600 traefik/acme.json
docker compose --env-file .env.traefik -f docker-compose.traefik.yml up -d

# 2. Portainer (optional management UI)
docker compose -f docker-compose.portainer.yml up -d

# 3. Environment files — create .env.develop and .env.staging from the
#    variable list below (values are kept outside the repo).
#    Give each its own APP_DOMAIN, POSTGRES_HOST_PORT, database and secrets.
nano .env.develop && nano .env.staging && chmod 600 .env.develop .env.staging

# 4. Registry access for pulls
docker login ghcr.io -u <github-user>            # PAT with read:packages

# 5. First rollout, by hand once (step 7 hands later deploys to CI)
deploy/release.sh develop ghcr.io/pixelcare-consulting/isms:develop
deploy/release.sh staging ghcr.io/pixelcare-consulting/isms:staging

# 6. Seed core data (tenant, roles, permissions) — once per fresh database, per env
#    The runtime image has no src/ (the seed imports it), so run it from the
#    checkout in a throwaway Node container on the stack's internal network.
#    Swap develop → staging for the other env; SEED_PROFILE=full adds demo data.
docker run --rm --network isms-develop_internal --env-file .env.develop \
  -v "$PWD":/src:ro node:22-bookworm \
  bash -c 'cp -r /src /work && cd /work && npm i -g pnpm@11.6.0 >/dev/null \
    && pnpm install --frozen-lockfile && pnpm exec prisma db seed'

# 7. Self-hosted runner, so CI can deploy (then CI takes over).
#    Token: GitHub → Settings → Actions → Runners → New self-hosted runner
#    (Linux x64). It expires after 1 hour.
useradd -m -s /bin/bash github-runner && usermod -aG docker github-runner
chown -R github-runner:github-runner /srv/isms
git config --global --add safe.directory /srv/isms   # root can still use git here
su - github-runner -c "mkdir -p actions-runner && cd actions-runner \
  && curl -sL https://github.com/actions/runner/releases/download/v<ver>/actions-runner-linux-x64-<ver>.tar.gz | tar xz \
  && ./config.sh --unattended --url https://github.com/Pixelcare-Consulting/ISMS \
       --token <token> --name <server> --labels isms-develop,isms-staging"
cd /home/github-runner/actions-runner && ./svc.sh install github-runner && ./svc.sh start
```

Check the runner with `./svc.sh status` in that folder, or on GitHub under
Settings → Actions → Runners (it should show **Idle**). Deploy jobs queue,
rather than fail, while it's offline.

Both stacks share the server safely: distinct project names (`isms-develop`,
`isms-staging`), volumes, internal networks and Postgres host ports; only
Traefik is shared, and it routes by `APP_DOMAIN`.

## Local development (the `sandbox` stack)

```bash
# create .env.sandbox (variable list below; values kept outside the repo)
deploy/stack.sh sandbox up -d --build         # whole stack → http://localhost:3000
deploy/stack.sh sandbox up -d postgres        # DB only, then `pnpm dev` on the host (.env.local)
APP_IMAGE=ghcr.io/pixelcare-consulting/isms:develop deploy/stack.sh sandbox up -d --pull always
deploy/stack.sh sandbox --profile cron up -d  # also run the SAP sync sidecar
```

Nothing here is deployed — it is the same stack CI uses for the e2e suite.
`.env.sandbox` is deliberately not `.env.local` or `.env.development`: Next.js
auto-loads those into `next dev` / `next build`, which would pull container
hostnames like `postgres:5432` into your host run. Keep `.env.local` for `pnpm dev`.

## Environment variables

Env files (`.env.sandbox`, `.env.develop`, `.env.staging`, `.env.traefik`) are
**never committed** and hold no example values in this repo. `deploy/stack.sh`
passes the file both as `--env-file` (Compose `${VAR}` interpolation) and
`env_file:` (into the containers). Variables the stack reads:

- Compose: `APP_IMAGE` (required on develop/staging), `APP_DOMAIN` (develop/staging), `APP_HOST_PORT` (sandbox), `POSTGRES_HOST_PORT` (unique per env on a shared server)
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
curl -s https://$APP_DOMAIN/api/health               # {"status":"ok"} or 503 (from outside the client LAN)
curl -sk --resolve $APP_DOMAIN:443:127.0.0.1 https://$APP_DOMAIN/api/health   # same check, on the server itself

deploy/stack.sh staging run --rm migrator               # re-run migrations
deploy/stack.sh staging run --rm app ./node_modules/.bin/prisma migrate status
deploy/stack.sh staging exec postgres psql -U isms -d isms

# manual backup / restore
deploy/stack.sh staging exec postgres pg_dump -U isms isms | gzip > isms-$(date +%F).sql.gz
gunzip -c isms-YYYY-MM-DD.sql.gz | deploy/stack.sh staging exec -T postgres psql -U isms -d isms

# roll back / promote a specific image without CI
deploy/release.sh staging ghcr.io/pixelcare-consulting/isms:sha-<previous commit>

# deploy runner (in /home/github-runner/actions-runner)
./svc.sh status | ./svc.sh stop | ./svc.sh start
journalctl -u 'actions.runner.*' -f
```

Persistent data per environment: volumes `isms-<develop|staging>_postgres-data` and
`isms-<develop|staging>_uploads-data` (policy attachments, audit archives — `STORAGE_ROOT=/app/data/uploads`).
Back up both.

Config changes: edit `.env.<env>`, then `deploy/stack.sh <env> up -d` (recreates
`app`). `MAINTENANCE_MODE=true` is a runtime switch. Nothing needs a rebuild
except `NEXT_PUBLIC_SUPPORT_EMAIL`.

## Promoting

```bash
# feature → develop (auto-deploys the internal environment)
gh pr create --base develop --head feature/my-change

# develop → staging (auto-deploys the client QA environment)
gh pr create --base staging --head develop --title "Promote to staging"
```

The staging deploy reuses the exact `sha-…` image the team already exercised on
develop — it is not rebuilt, so there is nothing new to go wrong between the
two environments.

## Adding production later

Everything is built so production is additive, not a rewrite. When the client
signs off on staging:

1. `git checkout -b production staging && git push -u origin production`
2. Restore the production Compose override:
   `git show 2edb4b5:docker-compose.production.yml > docker-compose.production.yml`
   (it is the staging override plus a nightly `postgres-backup` sidecar)
3. Add `production` to the trigger lists, the `workflow_dispatch` choice and the
   `target` job's branch cases in `.github/workflows/ci.yml`, and to the `case`
   statements in `deploy/stack.sh` and `deploy/release.sh`. Give the server's
   runner an `isms-production` label (Settings → Actions → Runners → the runner
   → labels). If production runs on a different server, register a runner there.
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
