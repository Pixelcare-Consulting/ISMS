# syntax=docker/dockerfile:1

# FINDEN ISMS — multi-stage production image (Next.js standalone).
#
# One image serves development, staging and production: nothing environment-
# specific is baked in. All configuration (APP_URL, DATABASE_URL, secrets…)
# arrives at runtime through the env file each Compose stack loads.

ARG NODE_VERSION=22
ARG PNPM_VERSION=11.6.0

FROM node:${NODE_VERSION}-bookworm-slim AS base
ARG PNPM_VERSION
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g "pnpm@${PNPM_VERSION}"

# Dummy connection strings so `prisma generate` (postinstall) never needs a live DB
ENV DATABASE_URL="postgresql://isms:isms@127.0.0.1:5432/isms"
ENV DIRECT_URL="postgresql://isms:isms@127.0.0.1:5432/isms"

# ---------------------------------------------------------------- deps
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------- builder
FROM base AS builder
# The only NEXT_PUBLIC_* value read in client code (help portal). Inlined at
# build time by Next.js, so it is a build arg rather than runtime config.
ARG NEXT_PUBLIC_SUPPORT_EMAIL=""
ENV NEXT_PUBLIC_SUPPORT_EMAIL=${NEXT_PUBLIC_SUPPORT_EMAIL}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm exec prisma generate && pnpm run build

# ---------------------------------------------------------------- runner
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
# Policy attachments + audit archives (src/lib/storage/local-fs.ts).
# Every Compose stack mounts a named volume here.
ENV STORAGE_ROOT=/app/data/uploads

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs \
    && mkdir -p /app/data/uploads \
    && chown -R nextjs:nodejs /app/data

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Full node_modules so `prisma migrate deploy` / `prisma db seed` work with
# pnpm's .pnpm store layout (the migrator service runs from this same image).
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/database ./database
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --chown=nextjs:nodejs --chmod=755 deploy/entrypoint.sh ./deploy/entrypoint.sh

USER nextjs
EXPOSE 3000

# node:*-slim ships neither curl nor wget, so probe with Node itself.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/app/deploy/entrypoint.sh"]
CMD ["node", "server.js"]
