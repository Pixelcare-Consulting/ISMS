import { prisma } from "@/lib/database/client";
import {
  createInChunks,
  markSapSeen,
  unseenSince,
  updateEach,
  type SapWriteFailure,
} from "@/features/sap/services/sap-sync-writer";
import type { SapSyncApplyResult } from "@/features/sap/types/sap-sync-entity";

export const warehouseRepository = {
  listByTenant(tenantId: string) {
    return prisma.warehouse.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        locations: { orderBy: { code: "asc" } },
        _count: { select: { aors: true, pulloutsDestination: true } },
      },
      orderBy: [{ isMain: "desc" }, { name: "asc" }],
    });
  },

  findById(tenantId: string, id: string) {
    return prisma.warehouse.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { locations: { orderBy: { code: "asc" } } },
    });
  },

  create(
    tenantId: string,
    data: { code: string; name: string; isMain?: boolean },
  ) {
    return prisma.warehouse.create({
      data: { tenantId, ...data },
      include: { locations: true },
    });
  },

  update(
    tenantId: string,
    id: string,
    data: { code?: string; name?: string; isMain?: boolean },
  ) {
    return prisma.warehouse.update({
      where: { id, tenantId },
      data,
      include: { locations: true },
    });
  },

  /**
   * Apply one page of a SAP warehouse sync, matched on `code`.
   *
   * ISMS warehouses have no status column, so SAP's Inactive flag maps to the soft
   * delete: an inactive warehouse is soft-deleted, and one SAP reactivates is restored.
   */
  async applySapSyncPage(
    tenantId: string,
    records: { code: string; name: string; isInactive: boolean }[],
  ): Promise<SapSyncApplyResult> {
    // Paged by WarehouseCode, so a repeat within a page would be a SAP anomaly.
    const rows = [...new Map(records.map((row) => [row.code, row])).values()];

    const existing = await prisma.warehouse.findMany({
      where: { tenantId, code: { in: rows.map((row) => row.code) } },
      select: { id: true, code: true, name: true, deletedAt: true },
    });
    const byCode = new Map(existing.map((warehouse) => [warehouse.code, warehouse]));

    const failures: SapWriteFailure[] = [];
    const toCreate: { code: string; name: string }[] = [];
    const toUpdate: { id: string; code: string; name: string; deletedAt: Date | null }[] = [];
    let unchanged = 0;

    for (const row of rows) {
      const match = byCode.get(row.code);

      // Don't create dead master data. Decided here rather than in the descriptor because
      // it turns on whether a match exists.
      if (row.isInactive && !match) {
        failures.push({ reason: "Inactive in SAP — not imported", example: row.code });
        continue;
      }

      const fields = { code: row.code, name: row.name };
      if (!match) {
        toCreate.push(fields);
        continue;
      }
      // Keep the original deletion time rather than restamping it every pass.
      const deletedAt = row.isInactive ? (match.deletedAt ?? new Date()) : null;
      if (match.name === fields.name && (match.deletedAt === null) === (deletedAt === null)) {
        unchanged += 1;
      } else {
        toUpdate.push({ id: match.id, ...fields, deletedAt });
      }
    }

    const inserted = await createInChunks(toCreate, {
      createMany: async (chunk) => {
        const result = await prisma.warehouse.createMany({
          data: chunk.map((row) => ({ tenantId, ...row })),
        });
        return result.count;
      },
      createOne: async (row) => {
        await prisma.warehouse.create({ data: { tenantId, ...row } });
      },
      describe: (row) => row.code,
    });

    const changed = await updateEach(toUpdate, {
      updateOne: async (row) => {
        await prisma.warehouse.update({
          where: { id: row.id, tenantId },
          data: { name: row.name, deletedAt: row.deletedAt },
        });
      },
      describe: (row) => row.code,
    });

    return {
      created: inserted.created,
      updated: changed.updated,
      unchanged,
      failures: [...failures, ...inserted.failures, ...changed.failures],
    };
  },

  markSapSyncSeen(tenantId: string, codes: string[], passMark: Date) {
    return markSapSeen("warehouses", tenantId, codes, passMark);
  },

  /** Soft-delete warehouses a completed warehouse sync pass no longer found in SAP. */
  async retireUnseenSapWarehouses(tenantId: string, passMark: Date): Promise<number> {
    const { count } = await prisma.warehouse.updateMany({
      where: { tenantId, ...unseenSince(passMark) },
      data: { deletedAt: new Date() },
    });
    return count;
  },

  addLocation(warehouseId: string, data: { code: string; name: string }) {
    return prisma.warehouseLocation.create({
      data: { warehouseId, ...data },
    });
  },

  deleteLocation(warehouseId: string, locationId: string) {
    return prisma.warehouseLocation.deleteMany({
      where: { id: locationId, warehouseId },
    });
  },
};
