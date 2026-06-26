import { prisma } from "@/lib/database/client";
import {
  resolvePagination,
  toPaginatedResult,
  type PaginationInput,
} from "@/lib/shared/pagination";
import type { Prisma } from "@prisma/client";

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
        branch: { select: { id: true, name: true } },
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
  ) {
    const { limit, page, skip } = resolvePagination(pagination);
    const where = allocationGapsWhere(tenantId, periodId, filters);

    const [items, total] = await Promise.all([
      prisma.branchAllocation.findMany({
        where,
        include: {
          branch: { select: { id: true, name: true } },
          model: { select: { id: true, skuCode: true, name: true } },
        },
        orderBy: [{ branch: { name: "asc" } }, { model: { skuCode: "asc" } }],
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

  getPlanningSummary(tenantId: string) {
    return prisma.planningPeriod.findFirst({
      where: { tenantId, isActive: true },
      include: {
        branchTargets: {
          include: { branch: { select: { name: true } } },
        },
        _count: { select: { allocations: true } },
      },
    });
  },

  countDraftAutoReplenishOrders(tenantId: string) {
    return prisma.branchOrder.count({
      where: { tenantId, orderType: "auto_replenish", status: "draft" },
    });
  },
};
