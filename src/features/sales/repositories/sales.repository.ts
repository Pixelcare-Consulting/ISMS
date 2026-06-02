import { prisma } from "@/lib/database/client";
import {
  resolvePagination,
  toPaginatedResult,
} from "@/lib/shared/pagination";
import type { Prisma } from "@prisma/client";

const salesListInclude = {
  branch: { select: { name: true } },
  serialNumber: { select: { serialNo: true } },
  returnRequest: { select: { id: true, status: true } },
} satisfies Prisma.BranchSalesTransactionInclude;

export const salesRepository = {
  async listForTenant(
    tenantId: string,
    pagination?: { page?: number; limit?: number },
  ) {
    const { limit, page, skip } = resolvePagination(pagination);
    const where: Prisma.BranchSalesTransactionWhereInput = { tenantId };

    const [items, total] = await Promise.all([
      prisma.branchSalesTransaction.findMany({
        where,
        include: salesListInclude,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.branchSalesTransaction.count({ where }),
    ]);

    return toPaginatedResult(items, total, page, limit);
  },
};
