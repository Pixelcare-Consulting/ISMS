import type { PrismaClient } from "@/lib/database/generated/prisma/client";

import { createPrismaClient } from "@/lib/database/create-prisma-client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaSchemaStamp: string | undefined;
};

/**
 * Bust the dev-server singleton when the generated client gains columns.
 * Next keeps `globalThis.prisma` across hot reload, so a migration applied
 * while `pnpm run dev` is up would otherwise keep querying the old client.
 */
const prismaSchemaStamp = "20261008170000_serial_sap_whs_code";

if (globalForPrisma.prismaSchemaStamp !== prismaSchemaStamp) {
  void globalForPrisma.prisma?.$disconnect();
  globalForPrisma.prisma = undefined;
  globalForPrisma.prismaSchemaStamp = prismaSchemaStamp;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

globalForPrisma.prisma = prisma;
