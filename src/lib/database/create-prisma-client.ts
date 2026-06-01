import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/database/generated/prisma/client";

import { logger } from "@/lib/shared/logger";

const prismaLogLevels =
  process.env.NODE_ENV === "development"
    ? process.env.PRISMA_LOG_QUERIES === "1"
      ? (["query", "error", "warn"] as const)
      : (["error", "warn"] as const)
    : (["error"] as const);

function parseSlowQueryThreshold(): number {
  const raw = process.env.SLOW_QUERY_MS;
  if (raw === undefined || raw === "") {
    return 500;
  }
  const ms = Number.parseInt(raw, 10);
  return Number.isFinite(ms) && ms > 0 ? ms : 500;
}

function createDatabaseAdapter(): PrismaPg {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for Prisma Client");
  }

  return new PrismaPg({ connectionString });
}

export function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    adapter: createDatabaseAdapter(),
    log: [...prismaLogLevels],
  });

  const slowQueryMs = parseSlowQueryThreshold();

  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const start = performance.now();
          const result = await query(args);
          const durationMs = Math.round(performance.now() - start);

          if (durationMs >= slowQueryMs) {
            logger.warn(
              { model, operation, durationMs, thresholdMs: slowQueryMs },
              "slow database query",
            );
          }

          return result;
        },
      },
    },
  }) as unknown as PrismaClient;
}
