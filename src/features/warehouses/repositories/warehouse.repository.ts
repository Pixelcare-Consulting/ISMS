import { prisma } from "@/lib/database/client";
import {
  createInChunks,
  updateEach,
  type SapWriteFailure,
} from "@/features/sap/services/sap-sync-writer";
import type { SapSyncApplyResult } from "@/features/sap/types/sap-sync-entity";

export const warehouseRepository = {
  listByTenant(tenantId: string) {
    return prisma.warehouse.findMany({
      where: { tenantId },
      include: {
        locations: { orderBy: { code: "asc" } },
        _count: { select: { aors: true, pulloutsDestination: true } },
      },
      orderBy: [{ isMain: "desc" }, { name: "asc" }],
    });
  },

  findById(tenantId: string, id: string) {
    return prisma.warehouse.findFirst({
      where: { id, tenantId },
      include: { locations: { orderBy: { code: "asc" } } },
    });
  },

  countLinks(tenantId: string, id: string) {
    return prisma.warehouse
      .findFirstOrThrow({
        where: { id, tenantId },
        select: {
          _count: { select: { aors: true, pulloutsDestination: true } },
          locations: {
            select: { _count: { select: { inventories: true } } },
          },
        },
      })
      .then((row) => ({
        aors: row._count.aors,
        pulloutsDestination: row._count.pulloutsDestination,
        inventory: row.locations.reduce(
          (sum, location) => sum + location._count.inventories,
          0,
        ),
      }));
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

  /** Apply one page of a SAP warehouse sync, matched on `code`. */
  async applySapSyncPage(
    tenantId: string,
    records: { code: string; name: string; isInactive: boolean }[],
  ): Promise<SapSyncApplyResult> {
    // Paged by WarehouseCode, so a repeat within a page would be a SAP anomaly.
    const rows = [...new Map(records.map((row) => [row.code, row])).values()];

    const existing = await prisma.warehouse.findMany({
      where: { tenantId, code: { in: rows.map((row) => row.code) } },
      select: { id: true, code: true, name: true },
    });
    const byCode = new Map(existing.map((warehouse) => [warehouse.code, warehouse]));

    const failures: SapWriteFailure[] = [];
    const toCreate: { code: string; name: string }[] = [];
    const toUpdate: { id: string; code: string; name: string }[] = [];
    let unchanged = 0;

    for (const row of rows) {
      const match = byCode.get(row.code);

      // ISMS warehouses have no active/inactive flag, so a SAP-inactive warehouse has
      // nowhere to land. Don't create dead master data — but leave an existing ISMS
      // warehouse alone rather than silently retiring something still in use. Decided
      // here rather than in the descriptor because it turns on whether a match exists.
      if (row.isInactive && !match) {
        failures.push({ reason: "Inactive in SAP — not imported", example: row.code });
        continue;
      }

      const fields = { code: row.code, name: row.name };
      if (!match) toCreate.push(fields);
      else if (match.name === fields.name) unchanged += 1;
      else toUpdate.push({ id: match.id, ...fields });
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
          data: { name: row.name },
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

  addLocation(warehouseId: string, data: { code: string; name: string }) {
    return prisma.warehouseLocation.create({
      data: { warehouseId, ...data },
    });
  },

  deleteWarehouse(tenantId: string, id: string) {
    return prisma.warehouse.delete({
      where: { id, tenantId },
    });
  },

  deleteLocation(warehouseId: string, locationId: string) {
    return prisma.warehouseLocation.deleteMany({
      where: { id: locationId, warehouseId },
    });
  },
};
