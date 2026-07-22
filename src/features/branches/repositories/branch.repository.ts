import { prisma } from "@/lib/database/client";
import type { BranchStatus } from "@/lib/database/generated/prisma/client";

export const branchRepository = {
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
          include: { warehouse: { select: { id: true, name: true, code: true } } },
        },
        _count: { select: { aors: true, branchInventories: true } },
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
      alternateWarehouseIds?: string[];
      deliverySchedule?: object | null;
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
        alternateWarehouses: data.alternateWarehouseIds?.length
          ? {
              create: data.alternateWarehouseIds.map((warehouseId) => ({ warehouseId })),
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
      alternateWarehouseIds?: string[];
      deliverySchedule?: object | null;
      status?: BranchStatus;
    },
  ) {
    return prisma.$transaction(async (tx) => {
      if (data.alternateWarehouseIds) {
        await tx.alternateWarehouse.deleteMany({ where: { branchId: id } });
        if (data.alternateWarehouseIds.length > 0) {
          await tx.alternateWarehouse.createMany({
            data: data.alternateWarehouseIds.map((warehouseId) => ({
              branchId: id,
              warehouseId,
            })),
          });
        }
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
      select: { id: true, sapCode: true, name: true },
    });
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
      select: { sapCode: true, name: true },
      orderBy: { sapCode: "asc" },
    });
  },

  listFormOptions(tenantId: string) {
    return Promise.all([
      prisma.area.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
      prisma.branchArea.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
      prisma.dealer.findMany({
        where: { tenantId, deletedAt: null },
        orderBy: { name: "asc" },
      }),
      prisma.warehouse.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
      prisma.region.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
      prisma.province.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
    ]).then(([areas, branchAreas, dealers, warehouses, regions, provinces]) => ({
      areas,
      branchAreas,
      dealers,
      warehouses,
      regions,
      provinces,
    }));
  },
};
