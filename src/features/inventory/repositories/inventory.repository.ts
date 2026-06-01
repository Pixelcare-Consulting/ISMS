import { prisma } from "@/lib/database/client";
import {
  resolvePagination,
  toPaginatedResult,
} from "@/lib/shared/pagination";
import type { Prisma } from "@prisma/client";

const inventoryListInclude = {
  branch: { select: { id: true, name: true, sapCode: true } },
  statusCode: { select: { id: true, code: true, name: true } },
  serialNumber: {
    include: {
      model: {
        select: {
          id: true,
          skuCode: true,
          name: true,
          brand: { select: { name: true } },
        },
      },
    },
  },
} satisfies Prisma.BranchInventoryInclude;

export const inventoryRepository = {
  async listByBranches(
    tenantId: string,
    branchIds: string[],
    pagination?: { page?: number; limit?: number },
  ) {
    if (branchIds.length === 0) {
      const { limit, page } = resolvePagination(pagination);
      return toPaginatedResult([], 0, page, limit);
    }

    const { limit, page, skip } = resolvePagination(pagination);
    const where: Prisma.BranchInventoryWhereInput = {
      tenantId,
      branchId: { in: branchIds },
    };

    const [items, total] = await Promise.all([
      prisma.branchInventory.findMany({
        where,
        include: inventoryListInclude,
        orderBy: { updatedAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.branchInventory.count({ where }),
    ]);

    return toPaginatedResult(items, total, page, limit);
  },

  countByStatus(tenantId: string, branchIds: string[]) {
    if (branchIds.length === 0) return Promise.resolve([]);
    return prisma.branchInventory.groupBy({
      by: ["statusCodeId"],
      where: { tenantId, branchId: { in: branchIds } },
      _count: { id: true },
    });
  },

  updateStatus(
    tenantId: string,
    id: string,
    statusCodeId: string,
    updatedById: string,
  ) {
    return prisma.branchInventory.update({
      where: { id, tenantId },
      data: { statusCodeId, updatedById },
    });
  },

  countByStatusCode(tenantId: string, branchIds: string[], statusCodeId: string) {
    if (branchIds.length === 0) return Promise.resolve(0);
    return prisma.branchInventory.count({
      where: { tenantId, branchId: { in: branchIds }, statusCodeId },
    });
  },
};
