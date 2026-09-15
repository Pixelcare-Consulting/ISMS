# syntax=docker/dockerfile:1.7

############################
# Base
############################
FROM node:24-alpine AS base

RUN apk add --no-cache libc6-compat dumb-init

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

WORKDIR /app

############################
# Dependencies
############################
FROM base AS deps

# Copy dependency manifests first
COPY package.json pnpm-lock.yaml ./
# COPY .npmrc ./
# COPY pnpm-workspace.yaml ./

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --dangerously-allow-all-builds

############################
# Development
############################
FROM base AS dev

COPY --from=deps /app/node_modules ./node_modules
COPY . .

EXPOSE 3000

CMD ["pnpm", "run", "dev:docker"]

############################
# Builder
############################
FROM base AS builder

ENV NEXT_TELEMETRY_DISABLED=1

# Reuse installed dependencies
COPY --from=deps /app/node_modules ./node_modules

# pnpm requires package.json
COPY package.json pnpm-lock.yaml ./

# Copy Prisma first for better cache utilization
COPY prisma ./prisma
COPY prisma.config.ts ./

# Generate Prisma Client

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm prisma generate

# Copy application source
COPY . .

# Build Next.js standalone output
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm build

############################
# Production (app + migrator)
############################
FROM node:24-alpine AS runner

RUN apk add --no-cache libc6-compat dumb-init

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup -S nodejs && \
    adduser -S nextjs -G nodejs

# Standalone server
COPY --from=builder /app/.next/standalone ./

# Static assets
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Prisma migrate tooling (same image; Compose overrides CMD for one-shot migrator)
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/constants ./constants

RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD wget --spider -q http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["dumb-init", "--"]

CMD ["node", "server.js"]