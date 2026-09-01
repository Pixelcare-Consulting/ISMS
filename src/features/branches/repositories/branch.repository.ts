import { prisma } from "@/lib/database/client";
import {
  createInChunks,
  updateEach,
  type SapWriteFailure,
} from "@/features/sap/services/sap-sync-writer";
import type { SapSyncApplyResult } from "@/features/sap/types/sap-sync-entity";
import type { BranchStatus } from "@/lib/database/generated/prisma/client";

export interface BranchScheduleInput {
  frequencyCodeId: string;
  deliveryDays: number[];
  orderDays: number[];
  notes?: string | null;
}

export const branchRepository = {
  /** Minimal branch context used to gate order creation. */
  findScheduleContext(tenantId: string, branchId: string) {
    return prisma.branch.findFirst({
      where: { id: branchId, tenantId, deletedAt: null },
      select: {
        id: true,
        name: true,
        deliveryScheduleConfig: {
          select: { orderDays: true },
        },
      },
    });
  },

  listByTenant(tenantId: string) {
    return prisma.branch.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        area: { select: { id: true, name: true, code: true } },
        branchArea: { select: { id: true, name: true } },
        dealer: { select: { id: true, name: true } },
        primaryWarehouse: { select: { id: true, name: true, code: true } },
        region: { select: { id: true, name: true } },
        province: { select: { id: true, name: true } },
        alternateWarehouses: {
          include: {
            alternateBranch: { select: { id: true, name: true, sapCode: true } },
          },
        },
        deliveryScheduleConfig: true,
        _count: { select: { aors: true, branchInventories: true } },
      },
      orderBy: { name: "asc" },
    });
  },

  listActiveByTenant(tenantId: string, dealerId?: string | null) {
    return prisma.branch.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: "active",
        ...(dealerId ? { dealerId } : {}),
      },
      select: {
        id: true,
        name: true,
        sapCode: true,
        dealerId: true,
      },
      orderBy: { name: "asc" },
    });
  },

  findById(tenantId: string, id: string) {
    return prisma.branch.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        area: true,
        branchArea: true,
        dealer: true,
        primaryWarehouse: true,
        region: true,
        province: true,
        alternateWarehouses: true,
        deliveryScheduleConfig: true,
      },
    });
  },

  create(
    tenantId: string,
    data: {
      sapCode: string;
      name: string;
      areaId?: string | null;
      branchAreaId?: string | null;
      dealerId?: string | null;
      primaryWarehouseId?: string | null;
      regionId?: string | null;
      provinceId?: string | null;
      alternateBranchIds?: string[];
      deliverySchedule?: object | null;
      schedule?: BranchScheduleInput | null;
      status?: BranchStatus;
    },
  ) {
    return prisma.branch.create({
      data: {
        tenantId,
        sapCode: data.sapCode,
        name: data.name,
        areaId: data.areaId ?? null,
        branchAreaId: data.branchAreaId ?? null,
        dealerId: data.dealerId ?? null,
        primaryWarehouseId: data.primaryWarehouseId ?? null,
        regionId: data.regionId ?? null,
        provinceId: data.provinceId ?? null,
        deliverySchedule: data.deliverySchedule ?? undefined,
        status: data.status ?? "active",
        alternateWarehouses: data.alternateBranchIds?.length
          ? {
              create: data.alternateBranchIds.map((alternateBranchId) => ({
                alternateBranchId,
              })),
            }
          : undefined,
        deliveryScheduleConfig: data.schedule
          ? {
              create: {
                tenantId,
                frequencyCodeId: data.schedule.frequencyCodeId,
                deliveryDays: data.schedule.deliveryDays,
                orderDays: data.schedule.orderDays,
                notes: data.schedule.notes ?? null,
              },
            }
          : undefined,
      },
      include: {
        branchArea: { select: { name: true } },
        dealer: { select: { name: true } },
      },
    });
  },

  update(
    tenantId: string,
    id: string,
    data: {
      sapCode?: string;
      name?: string;
      areaId?: string | null;
      branchAreaId?: string | null;
      dealerId?: string | null;
      primaryWarehouseId?: string | null;
      regionId?: string | null;
      provinceId?: string | null;
      alternateBranchIds?: string[];
      deliverySchedule?: object | null;
      schedule?: BranchScheduleInput | null;
      status?: BranchStatus;
    },
  ) {
    return prisma.$transaction(async (tx) => {
      if (data.alternateBranchIds) {
        await tx.alternateWarehouse.deleteMany({ where: { branchId: id } });
        if (data.alternateBranchIds.length > 0) {
          await tx.alternateWarehouse.createMany({
            data: data.alternateBranchIds.map((alternateBranchId) => ({
              branchId: id,
              alternateBranchId,
            })),
          });
        }
      }

      if (data.schedule === null) {
        await tx.branchDeliverySchedule.deleteMany({ where: { branchId: id } });
      } else if (data.schedule) {
        await tx.branchDeliverySchedule.upsert({
          where: { branchId: id },
          create: {
            tenantId,
            branchId: id,
            frequencyCodeId: data.schedule.frequencyCodeId,
            deliveryDays: data.schedule.deliveryDays,
            orderDays: data.schedule.orderDays,
            notes: data.schedule.notes ?? null,
          },
          update: {
            frequencyCodeId: data.schedule.frequencyCodeId,
            deliveryDays: data.schedule.deliveryDays,
            orderDays: data.schedule.orderDays,
            notes: data.schedule.notes ?? null,
          },
        });
      }

      return tx.branch.update({
        where: { id, tenantId },
        data: {
          sapCode: data.sapCode,
          name: data.name,
          areaId: data.areaId,
          branchAreaId: data.branchAreaId,
          dealerId: data.dealerId,
          primaryWarehouseId: data.primaryWarehouseId,
          regionId: data.regionId,
          provinceId: data.provinceId,
          deliverySchedule: data.deliverySchedule ?? undefined,
          status: data.status,
        },
        include: {
          branchArea: { select: { name: true } },
          dealer: { select: { name: true } },
        },
      });
    });
  },

  softDelete(tenantId: string, id: string) {
    return prisma.branch.update({
      where: { id, tenantId },
      data: { deletedAt: new Date() },
    });
  },

  /** Bulk lookup for the CSV import — one query instead of one per row. */
  findManyBySapCodes(tenantId: string, sapCodes: string[]) {
    return prisma.branch.findMany({
      where: { tenantId, deletedAt: null, sapCode: { in: sapCodes } },
      select: {
        id: true,
        sapCode: true,
        name: true,
        status: true,
        dealerId: true,
        primaryWarehouseId: true,
        areaId: true,
        branchAreaId: true,
        regionId: true,
        provinceId: true,
        dealer: { select: { id: true, name: true, sapCode: true } },
        primaryWarehouse: { select: { id: true, name: true, code: true } },
        area: { select: { id: true, name: true, code: true } },
        branchArea: { select: { id: true, name: true } },
        region: { select: { id: true, name: true } },
        province: { select: { id: true, name: true } },
        alternateWarehouses: {
          select: {
            alternateBranchId: true,
            alternateBranch: { select: { sapCode: true } },
          },
        },
        deliveryScheduleConfig: {
          select: {
            frequencyCodeId: true,
            deliveryDays: true,
            orderDays: true,
            notes: true,
            frequencyCode: { select: { code: true } },
          },
        },
      },
    });
  },

  /**
   * Id-only variant of `findManyBySapCodes` for the import's write phase, which has
   * already diffed the rows and just needs to map sap codes back to branch ids.
   */
  findIdsBySapCodes(tenantId: string, sapCodes: string[]) {
    return prisma.branch.findMany({
      where: { tenantId, deletedAt: null, sapCode: { in: sapCodes } },
      select: { id: true, sapCode: true },
    });
  },

  /**
   * Apply one page of a SAP branch sync, matched on `sapCode`.
   *
   * Soft-deleted branches are looked up too, because they still occupy their sapCode
   * slot: re-creating over one would collide, so it is reported instead of silently
   * reviving a branch someone chose to remove.
   *
   * Not wrapped in a transaction. Each page is independently valid — the cursor only
   * advances once its page is written — and an interactive transaction pins a single
   * connection, which is what forced these writes to run one at a time before.
   */
  async applySapSyncPage(
    tenantId: string,
    records: { sapCode: string; name: string }[],
  ): Promise<SapSyncApplyResult> {
    // Paged by Code, so a repeat within a page would be a SAP anomaly; first wins.
    const rows = [...new Map(records.map((row) => [row.sapCode, row])).values()];

    const existing = await prisma.branch.findMany({
      where: { tenantId, sapCode: { in: rows.map((row) => row.sapCode) } },
      select: { id: true, sapCode: true, name: true, deletedAt: true },
    });
    const bySapCode = new Map(existing.map((branch) => [branch.sapCode, branch]));

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
      if (match.deletedAt) {
        failures.push({
          reason: "Matches a deleted ISMS branch — restore it before syncing",
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
        const result = await prisma.branch.createMany({
          data: chunk.map((row) => ({ tenantId, ...row })),
        });
        return result.count;
      },
      createOne: async (row) => {
        await prisma.branch.create({ data: { tenantId, ...row } });
      },
      describe: (row) => row.sapCode,
    });

    const changed = await updateEach(toUpdate, {
      updateOne: async (row) => {
        await prisma.branch.update({
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

  findModelsBySkuCodes(tenantId: string, skuCodes: string[]) {
    return prisma.productModel.findMany({
      where: { tenantId, skuCode: { in: skuCodes } },
      select: { id: true, skuCode: true, name: true },
    });
  },

  findAllowedModelsByBranchIds(tenantId: string, branchIds: string[]) {
    return prisma.branchAllowedModel.findMany({
      where: { tenantId, branchId: { in: branchIds } },
      select: { branchId: true, modelId: true },
    });
  },

  /** Active branches only — inactive ones are excluded from the import template. */
  listActiveForTemplate(tenantId: string) {
    return prisma.branch.findMany({
      where: { tenantId, deletedAt: null, status: "active" },
      select: {
        sapCode: true,
        name: true,
        status: true,
        dealer: { select: { sapCode: true, name: true } },
        primaryWarehouse: { select: { code: true, name: true } },
        branchArea: { select: { name: true } },
        area: { select: { code: true, name: true } },
        region: { select: { name: true } },
        province: { select: { name: true } },
        alternateWarehouses: {
          select: {
            alternateBranch: { select: { sapCode: true } },
          },
        },
        deliveryScheduleConfig: {
          select: {
            deliveryDays: true,
            orderDays: true,
            notes: true,
            frequencyCode: { select: { code: true } },
          },
        },
      },
      orderBy: { sapCode: "asc" },
    });
  },

  listFormOptions(tenantId: string) {
    return Promise.all([
      prisma.area.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
      prisma.branchArea.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
      prisma.dealer.findMany({
        where: { tenantId, deletedAt: null, status: "active" },
        orderBy: { name: "asc" },
      }),
      prisma.warehouse.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
      prisma.region.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
      prisma.province.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
      prisma.branch.findMany({
        where: { tenantId, deletedAt: null, status: "active" },
        select: { id: true, name: true, sapCode: true, dealerId: true },
        orderBy: { name: "asc" },
      }),
      prisma.frequencyCode.findMany({
        where: { tenantId },
        select: { id: true, code: true, frequency: true, description: true },
        orderBy: { code: "asc" },
      }),
    ]).then(
      ([areas, branchAreas, dealers, warehouses, regions, provinces, branches, frequencyCodes]) => ({
        areas,
        branchAreas,
        dealers,
        warehouses,
        regions,
        provinces,
        branches,
        frequencyCodes,
      }),
    );
  },
};
