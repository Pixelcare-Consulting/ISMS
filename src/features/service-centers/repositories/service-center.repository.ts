import { prisma } from "@/lib/database/client";
import {
  createInChunks,
  updateEach,
  type SapWriteFailure,
} from "@/features/sap/services/sap-sync-writer";
import type { SapSyncApplyResult } from "@/features/sap/types/sap-sync-entity";
import type { BranchStatus } from "@/lib/database/generated/prisma/client";

export const serviceCenterRepository = {
  listByTenant(tenantId: string) {
    return prisma.serviceCenter.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        area: { select: { id: true, name: true, code: true } },
        locations: { orderBy: { code: "asc" } },
      },
      orderBy: { name: "asc" },
    });
  },

  create(
    tenantId: string,
    data: {
      sapCode: string;
      name: string;
      status?: BranchStatus;
      areaId?: string | null;
    },
  ) {
    return prisma.serviceCenter.create({
      data: {
        tenantId,
        sapCode: data.sapCode,
        name: data.name,
        status: data.status ?? "active",
        areaId: data.areaId ?? null,
      },
    });
  },

  addLocation(
    serviceCenterId: string,
    data: {
      code: string;
      name: string;
      areaId?: string | null;
      dealerAreaId?: string | null;
      regionId?: string | null;
      provinceId?: string | null;
      branchAreaId?: string | null;
    },
  ) {
    return prisma.serviceCenterLocation.create({
      data: {
        serviceCenterId,
        code: data.code,
        name: data.name,
        areaId: data.areaId ?? null,
        dealerAreaId: data.dealerAreaId ?? null,
        regionId: data.regionId ?? null,
        provinceId: data.provinceId ?? null,
        branchAreaId: data.branchAreaId ?? null,
      },
    });
  },

  softDelete(tenantId: string, id: string) {
    return prisma.serviceCenter.update({
      where: { id, tenantId },
      data: { deletedAt: new Date() },
    });
  },

  deleteLocation(id: string) {
    return prisma.serviceCenterLocation.delete({ where: { id } });
  },

  async applySapSyncPage(
    tenantId: string,
    records: { sapCode: string; name: string }[],
  ): Promise<SapSyncApplyResult> {
    // Paged by WarehouseCode, so a repeat within a page would be a SAP anomaly; first wins.
    const rows = [...new Map(records.map((row) => [row.sapCode, row])).values()];

    const existing = await prisma.serviceCenter.findMany({
      where: { tenantId, sapCode: { in: rows.map((row) => row.sapCode) } },
      select: { id: true, sapCode: true, name: true, deletedAt: true },
    });
    const bySapCode = new Map(existing.map((centre) => [centre.sapCode, centre]));

    const failures: SapWriteFailure[] = [];
    const toCreate: { sapCode: string; name: string }[] = [];
    const toUpdate: { id: string; sapCode: string; name: string }[] = [];
    let unchanged = 0;

    for (const row of rows) {
      const match = bySapCode.get(row.sapCode);
      if (!match) {
        toCreate.push(row);
        continue;
      }
      // Soft-deleted rows still hold the unique sapCode, so writing through one would
      // fail on the constraint anyway. Say so rather than letting it read as a SAP error.
      if (match.deletedAt) {
        failures.push({
          reason: "Matches a deleted ISMS service centre — restore it before syncing",
          example: row.sapCode,
        });
        continue;
      }
      if (match.name === row.name) {
        unchanged += 1;
        continue;
      }
      toUpdate.push({ id: match.id, ...row });
    }

    const inserted = await createInChunks(toCreate, {
      createMany: async (chunk) => {
        const result = await prisma.serviceCenter.createMany({
          data: chunk.map((row) => ({ tenantId, ...row })),
        });
        return result.count;
      },
      createOne: async (row) => {
        await prisma.serviceCenter.create({ data: { tenantId, ...row } });
      },
      describe: (row) => row.sapCode,
    });

    // Name only: status is ISMS-managed, so a sync never revives a centre an admin
    // deactivated.
    const changed = await updateEach(toUpdate, {
      updateOne: async (row) => {
        await prisma.serviceCenter.update({
          where: { id: row.id, tenantId },
          data: { name: row.name },
        });
      },
      describe: (row) => row.sapCode,
    });

    return {
      created: inserted.created,
      updated: changed.updated,
      unchanged,
      failures: [...failures, ...inserted.failures, ...changed.failures],
    };
  },
};
