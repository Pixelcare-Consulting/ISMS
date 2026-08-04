import { prisma } from "@/lib/database/client";
import {
  resolvePagination,
  toPaginatedResult,
} from "@/lib/shared/pagination";
import type { Prisma } from "@prisma/client";

const salesListInclude = {
  branch: { select: { id: true, name: true } },
  details: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      serialNumberId: true,
      serialNumber: { select: { id: true, serialNo: true } },
    },
  },
  returnRequest: { select: { id: true, status: true } },
} satisfies Prisma.BranchSalesTransactionInclude;

export type SalesListSort =
  | "transactionNo"
  | "branch"
  | "amount"
  | "atrStatus"
  | "returnStatus";
export type SalesListSortDir = "asc" | "desc";

function salesPrismaOrderBy(
  field: SalesListSort,
  dir: SalesListSortDir,
): Prisma.BranchSalesTransactionOrderByWithRelationInput {
  switch (field) {
    case "transactionNo":
      return { transactionNo: dir };
    case "branch":
      return { branch: { name: dir } };
    case "amount":
      return { amount: dir };
    case "atrStatus":
      return { atrStatus: dir };
    case "returnStatus":
      return { returnRequest: { status: dir } };
    default:
      return { createdAt: dir };
  }
}

export const salesRepository = {
  async listForTenant(
    tenantId: string,
    pagination?: { page?: number; limit?: number },
    sort?: { field?: SalesListSort; dir?: SalesListSortDir },
  ) {
    const { limit, page, skip } = resolvePagination(pagination);
    const where: Prisma.BranchSalesTransactionWhereInput = { tenantId };
    const orderBy = sort?.field
      ? salesPrismaOrderBy(sort.field, sort.dir ?? "desc")
      : { createdAt: "desc" as const };

    const [items, total] = await Promise.all([
      prisma.branchSalesTransaction.findMany({
        where,
        include: salesListInclude,
        orderBy,
        skip,
        take: limit,
      }),
      prisma.branchSalesTransaction.count({ where }),
    ]);

    return toPaginatedResult(items, total, page, limit);
  },
};
