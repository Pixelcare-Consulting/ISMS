import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const prismaLogLevels =
  process.env.NODE_ENV === "development"
    ? process.env.PRISMA_LOG_QUERIES === "1"
      ? (["query", "error", "warn"] as const)
      : (["error", "warn"] as const)
    : (["error"] as const);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: [...prismaLogLevels],
  });

globalForPrisma.prisma = prisma;
