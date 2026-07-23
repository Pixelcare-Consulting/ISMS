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
          include: {
            alternateBranch: { select: { id: true, name: true, sapCode: true } },
          },
        },
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
        select: { id: true, name: true, sapCode: true },
        orderBy: { name: "asc" },
      }),
    ]).then(([areas, branchAreas, dealers, warehouses, regions, provinces, branches]) => ({
      areas,
      branchAreas,
      dealers,
      warehouses,
      regions,
      provinces,
      branches,
    }));
  },
};
