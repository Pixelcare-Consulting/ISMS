import { prisma } from "@/lib/database/client";
import type { SapMasterSyncResult } from "@/features/sap/schemas/sap-master-sync.schema";

export interface SapSyncStatusRow {
  entity: string;
  status: "running" | "success" | "error";
  startedAt: Date;
  result: unknown;
  error: string | null;
}

export const sapSyncStatusRepository = {
  listByTenant(tenantId: string, entities: string[]): Promise<SapSyncStatusRow[]> {
    return prisma.sapSyncStatus.findMany({
      where: { tenantId, entity: { in: entities } },
    });
  },

  markRunning(tenantId: string, entity: string, actorUserId: string) {
    return prisma.sapSyncStatus.upsert({
      where: { tenantId_entity: { tenantId, entity } },
      create: {
        tenantId,
        entity,
        status: "running",
        startedAt: new Date(),
        actorUserId,
      },
      update: {
        status: "running",
        startedAt: new Date(),
        finishedAt: null,
        result: undefined,
        error: null,
        actorUserId,
      },
    });
  },

  markSuccess(tenantId: string, entity: string, result: SapMasterSyncResult) {
    return prisma.sapSyncStatus.update({
      where: { tenantId_entity: { tenantId, entity } },
      data: {
        status: "success",
        finishedAt: new Date(),
        result: result as unknown as object,
        error: null,
      },
    });
  },

  markError(tenantId: string, entity: string, error: string) {
    return prisma.sapSyncStatus.update({
      where: { tenantId_entity: { tenantId, entity } },
      data: {
        status: "error",
        finishedAt: new Date(),
        error,
      },
    });
  },
};
