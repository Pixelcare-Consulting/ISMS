import type { PrismaClient } from "@/lib/database/generated/prisma/client";

import { createPrismaClient } from "@/lib/database/create-prisma-client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

globalForPrisma.prisma = prisma;
