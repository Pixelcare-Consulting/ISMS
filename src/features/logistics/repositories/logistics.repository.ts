import { prisma } from "@/lib/database/client";
import {
  resolvePagination,
  toPaginatedResult,
} from "@/lib/shared/pagination";
import type { Prisma } from "@prisma/client";

const deliveryListInclude = {
  branch: { select: { name: true, sapCode: true } },
  order: { select: { id: true, orderNumber: true } },
  statusCode: { select: { id: true, code: true, name: true, color: true } },
} satisfies Prisma.BranchDeliveryInclude;

const transferListInclude = {
  fromBranch: { select: { id: true, name: true } },
  toBranch: { select: { id: true, name: true } },
  statusCode: { select: { id: true, code: true, name: true, color: true } },
  lines: { select: { serialNumberId: true } },
} satisfies Prisma.BranchTransferInclude;

const pulloutListInclude = {
  branch: { select: { name: true } },
  warehouse: { select: { name: true, code: true } },
  statusCode: { select: { id: true, code: true, name: true, color: true } },
  reasonStatusCode: { select: { id: true, code: true, name: true, color: true } },
} satisfies Prisma.BranchPulloutInclude;

export type DeliveryListSort = "deliveryNo" | "orderNumber" | "branch" | "status";
export type TransferListSort = "transferNo" | "fromBranch" | "toBranch" | "status";
export type PulloutListSort = "pulloutNo" | "branch" | "warehouse" | "reason" | "status";
export type LogisticsListSortDir = "asc" | "desc";

function deliveryPrismaOrderBy(
  field: DeliveryListSort,
  dir: LogisticsListSortDir,
): Prisma.BranchDeliveryOrderByWithRelationInput {
  switch (field) {
    case "deliveryNo":
      return { deliveryNo: dir };
    case "orderNumber":
      return { order: { orderNumber: dir } };
    case "branch":
      return { branch: { name: dir } };
    case "status":
      return { statusCode: { code: dir } };
    default:
      return { createdAt: dir };
  }
}

function transferPrismaOrderBy(
  field: TransferListSort,
  dir: LogisticsListSortDir,
): Prisma.BranchTransferOrderByWithRelationInput {
  switch (field) {
    case "transferNo":
      return { transferNo: dir };
    case "fromBranch":
      return { fromBranch: { name: dir } };
    case "toBranch":
      return { toBranch: { name: dir } };
    case "status":
      return { statusCode: { code: dir } };
    default:
      return { createdAt: dir };
  }
}

function pulloutPrismaOrderBy(
  field: PulloutListSort,
  dir: LogisticsListSortDir,
): Prisma.BranchPulloutOrderByWithRelationInput {
  switch (field) {
    case "pulloutNo":
      return { pulloutNo: dir };
    case "branch":
      return { branch: { name: dir } };
    case "warehouse":
      return { warehouse: { name: dir } };
    case "reason":
      return { reasonStatusCode: { name: dir } };
    case "status":
      return { statusCode: { code: dir } };
    default:
      return { createdAt: dir };
  }
}

export const logisticsRepository = {
  countDeliveriesByStatus(tenantId: string) {
    return prisma.branchDelivery.groupBy({
      by: ["statusCodeId"],
      where: { tenantId },
      _count: { id: true },
    });
  },

  countAllDeliveries(tenantId: string) {
    return prisma.branchDelivery.count({ where: { tenantId } });
  },

  countTransfersByStatus(tenantId: string) {
    return prisma.branchTransfer.groupBy({
      by: ["statusCodeId"],
      where: { tenantId },
      _count: { id: true },
    });
  },

  countAllTransfers(tenantId: string) {
    return prisma.branchTransfer.count({ where: { tenantId } });
  },

  countPulloutsByStatus(tenantId: string) {
    return prisma.branchPullout.groupBy({
      by: ["statusCodeId"],
      where: { tenantId },
      _count: { id: true },
    });
  },

  countAllPullouts(tenantId: string) {
    return prisma.branchPullout.count({ where: { tenantId } });
  },

  async listDeliveries(
    tenantId: string,
    pagination?: { page?: number; limit?: number },
    sort?: { field?: DeliveryListSort; dir?: LogisticsListSortDir },
  ) {
    const { limit, page, skip } = resolvePagination(pagination);
    const where: Prisma.BranchDeliveryWhereInput = { tenantId };
    const orderBy = sort?.field
      ? deliveryPrismaOrderBy(sort.field, sort.dir ?? "desc")
      : { createdAt: "desc" as const };

    const [items, total] = await Promise.all([
      prisma.branchDelivery.findMany({
        where,
        include: deliveryListInclude,
        orderBy,
        skip,
        take: limit,
      }),
      prisma.branchDelivery.count({ where }),
    ]);

    return toPaginatedResult(items, total, page, limit);
  },

  async listTransfers(
    tenantId: string,
    pagination?: { page?: number; limit?: number },
    sort?: { field?: TransferListSort; dir?: LogisticsListSortDir },
  ) {
    const { limit, page, skip } = resolvePagination(pagination);
    const where: Prisma.BranchTransferWhereInput = { tenantId };
    const orderBy = sort?.field
      ? transferPrismaOrderBy(sort.field, sort.dir ?? "desc")
      : { createdAt: "desc" as const };

    const [items, total] = await Promise.all([
      prisma.branchTransfer.findMany({
        where,
        include: transferListInclude,
        orderBy,
        skip,
        take: limit,
      }),
      prisma.branchTransfer.count({ where }),
    ]);

    return toPaginatedResult(items, total, page, limit);
  },

  async listPullouts(
    tenantId: string,
    pagination?: { page?: number; limit?: number },
    sort?: { field?: PulloutListSort; dir?: LogisticsListSortDir },
  ) {
    const { limit, page, skip } = resolvePagination(pagination);
    const where: Prisma.BranchPulloutWhereInput = { tenantId };
    const orderBy = sort?.field
      ? pulloutPrismaOrderBy(sort.field, sort.dir ?? "desc")
      : { createdAt: "desc" as const };

    const [items, total] = await Promise.all([
      prisma.branchPullout.findMany({
        where,
        include: pulloutListInclude,
        orderBy,
        skip,
        take: limit,
      }),
      prisma.branchPullout.count({ where }),
    ]);

    return toPaginatedResult(items, total, page, limit);
  },
};
