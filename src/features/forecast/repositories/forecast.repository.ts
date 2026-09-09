import { prisma } from "@/lib/database/client";
import {
  resolvePagination,
  toPaginatedResult,
  type PaginationInput,
} from "@/lib/shared/pagination";
import type { Prisma } from "@prisma/client";

export type AllocationGapListSort = "branch" | "sku" | "currentStock" | "planogramMax" | "gapQty";
export type AllocationGapListSortDir = "asc" | "desc";

function allocationGapPrismaOrderBy(
  field: AllocationGapListSort,
  dir: AllocationGapListSortDir,
): Prisma.BranchAllocationOrderByWithRelationInput[] {
  switch (field) {
    case "branch":
      return [{ branch: { name: dir } }];
    case "sku":
      return [{ model: { skuCode: dir } }];
    case "currentStock":
      return [{ currentStock: dir }];
    case "planogramMax":
      return [{ planogramMax: dir }];
    case "gapQty":
      return [{ gapQty: dir }];
    default: {
      const _exhaustive: never = field;
      void _exhaustive;
      return [{ branch: { name: "asc" } }, { model: { skuCode: "asc" } }];
    }
  }
}

function allocationGapsWhere(
  tenantId: string,
  periodId: string,
  filters?: { branchId?: string; q?: string },
): Prisma.BranchAllocationWhereInput {
  const q = filters?.q?.trim();
  return {
    tenantId,
    periodId,
    gapQty: { gt: 0 },
    ...(filters?.branchId ? { branchId: filters.branchId } : {}),
    ...(q
      ? {
          OR: [
            { branch: { name: { contains: q, mode: "insensitive" } } },
            { model: { skuCode: { contains: q, mode: "insensitive" } } },
            { model: { name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
}

export const forecastRepository = {
  findActivePeriod(tenantId: string) {
    return prisma.planningPeriod.findFirst({
      where: { tenantId, isActive: true },
      orderBy: { updatedAt: "desc" },
    });
  },

  findPeriodById(tenantId: string, periodId: string) {
    return prisma.planningPeriod.findFirst({
      where: { id: periodId, tenantId },
    });
  },

  listPeriods(tenantId: string) {
    return prisma.planningPeriod.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: { id: true, label: true, isActive: true, createdAt: true },
    });
  },

  countTenantBranches(tenantId: string) {
    return prisma.branch.count({
      where: { tenantId, deletedAt: null },
    });
  },

  findBranchForPlanning(tenantId: string, branchId: string) {
    return prisma.branch.findFirst({
      where: { id: branchId, tenantId, deletedAt: null },
      select: { id: true, name: true, sapCode: true },
    });
  },

  async activatePeriod(tenantId: string, periodId: string) {
    return prisma.$transaction(async (tx) => {
      const period = await tx.planningPeriod.findFirst({
        where: { id: periodId, tenantId },
      });
      if (!period) return null;

      await tx.planningPeriod.updateMany({
        where: { tenantId, isActive: true, id: { not: periodId } },
        data: { isActive: false },
      });

      return tx.planningPeriod.update({
        where: { id: periodId },
        data: { isActive: true },
      });
    });
  },

  findTargetById(tenantId: string, id: string) {
    return prisma.branchForecastTarget.findFirst({
      where: { id, tenantId },
      include: { branch: { select: { id: true, name: true, sapCode: true } } },
    });
  },

  findTargetByPeriodBranch(tenantId: string, periodId: string, branchId: string) {
    return prisma.branchForecastTarget.findFirst({
      where: { tenantId, periodId, branchId },
    });
  },

  createTarget(
    tenantId: string,
    input: { periodId: string; branchId: string; revenueTarget: number },
  ) {
    return prisma.branchForecastTarget.create({
      data: {
        tenantId,
        periodId: input.periodId,
        branchId: input.branchId,
        revenueTarget: input.revenueTarget,
      },
      include: { branch: { select: { id: true, name: true, sapCode: true } } },
    });
  },

  updateTargetRevenue(tenantId: string, id: string, revenueTarget: number) {
    return prisma.branchForecastTarget.update({
      where: { id },
      data: { revenueTarget },
      include: { branch: { select: { id: true, name: true, sapCode: true } } },
    });
  },

  deleteTarget(tenantId: string, id: string) {
    return prisma.branchForecastTarget.delete({
      where: { id },
    });
  },

  deleteTargets(tenantId: string, ids: string[]) {
    return prisma.branchForecastTarget.deleteMany({
      where: { tenantId, id: { in: ids } },
    });
  },

  listTargetsForPeriod(tenantId: string, periodId: string) {
    return prisma.branchForecastTarget.findMany({
      where: { tenantId, periodId },
      include: { branch: { select: { id: true, name: true, sapCode: true } } },
      orderBy: { branch: { name: "asc" } },
    });
  },

  listAllocationsForPeriod(tenantId: string, periodId: string) {
    return prisma.branchAllocation.findMany({
      where: allocationGapsWhere(tenantId, periodId),
      include: {
        branch: { select: { id: true, name: true, sapCode: true } },
        model: { select: { id: true, skuCode: true, name: true } },
      },
      orderBy: [{ branch: { name: "asc" } }, { model: { skuCode: "asc" } }],
    });
  },

  async listAllocationsForPeriodPaginated(
    tenantId: string,
    periodId: string,
    pagination?: PaginationInput,
    filters?: { branchId?: string; q?: string },
    sort?: { field?: AllocationGapListSort; dir?: AllocationGapListSortDir },
  ) {
    const { limit, page, skip } = resolvePagination(pagination);
    const where = allocationGapsWhere(tenantId, periodId, filters);
    const orderBy = sort?.field
      ? allocationGapPrismaOrderBy(sort.field, sort.dir ?? "desc")
      : [{ branch: { name: "asc" as const } }, { model: { skuCode: "asc" as const } }];

    const [items, total] = await Promise.all([
      prisma.branchAllocation.findMany({
        where,
        include: {
          branch: { select: { id: true, name: true, sapCode: true } },
          model: { select: { id: true, skuCode: true, name: true } },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.branchAllocation.count({ where }),
    ]);

    return toPaginatedResult(items, total, page, limit);
  },

  countGapsForPeriod(tenantId: string, periodId: string) {
    return prisma.branchAllocation.count({
      where: { tenantId, periodId, gapQty: { gt: 0 } },
    });
  },

  deleteAllocationsForPeriod(tenantId: string, periodId: string) {
    return prisma.branchAllocation.deleteMany({
      where: { tenantId, periodId },
    });
  },

  createAllocations(
    tenantId: string,
    periodId: string,
    rows: {
      branchId: string;
      modelId: string;
      planogramMax: number;
      currentStock: number;
      gapQty: number;
      computedAt: Date;
    }[],
  ) {
    if (rows.length === 0) return Promise.resolve({ count: 0 });
    return prisma.branchAllocation.createMany({
      data: rows.map((row) => ({ tenantId, periodId, ...row })),
    });
  },

  replaceAllocationsForPeriod(
    tenantId: string,
    periodId: string,
    rows: {
      branchId: string;
      modelId: string;
      planogramMax: number;
      currentStock: number;
      gapQty: number;
      computedAt: Date;
    }[],
  ) {
    return prisma.$transaction(async (tx) => {
      await tx.branchAllocation.deleteMany({ where: { tenantId, periodId } });
      if (rows.length === 0) return { count: 0 };
      return tx.branchAllocation.createMany({
        data: rows.map((row) => ({ tenantId, periodId, ...row })),
      });
    });
  },

  getPlanningSummary(tenantId: string, periodId?: string) {
    return prisma.planningPeriod.findFirst({
      where: periodId
        ? { tenantId, id: periodId }
        : { tenantId, isActive: true },
      include: {
        _count: { select: { allocations: true, branchTargets: true } },
      },
      ...(periodId ? {} : { orderBy: { updatedAt: "desc" as const } }),
    });
  },

  countDraftAutoReplenishOrders(tenantId: string) {
    return prisma.branchOrder.count({
      where: { tenantId, orderType: "auto_replenish", status: "draft" },
    });
  },
};
