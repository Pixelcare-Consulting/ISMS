import { prisma } from "@/lib/database/client";
import {
  resolvePagination,
  toPaginatedResult,
} from "@/lib/shared/pagination";
import type { Prisma } from "@prisma/client";

const deliveryListInclude = {
  branch: { select: { name: true, sapCode: true } },
  order: { select: { id: true, orderNumber: true } },
  statusCode: { select: { id: true, code: true, name: true } },
} satisfies Prisma.BranchDeliveryInclude;

const transferListInclude = {
  fromBranch: { select: { name: true } },
  toBranch: { select: { name: true } },
  statusCode: { select: { id: true, code: true, name: true } },
} satisfies Prisma.BranchTransferInclude;

const pulloutListInclude = {
  branch: { select: { name: true } },
  warehouse: { select: { name: true, code: true } },
  statusCode: { select: { id: true, code: true, name: true } },
  reasonStatusCode: { select: { id: true, code: true, name: true } },
} satisfies Prisma.BranchPulloutInclude;

export const logisticsRepository = {
  async listDeliveries(
    tenantId: string,
    pagination?: { page?: number; limit?: number },
  ) {
    const { limit, page, skip } = resolvePagination(pagination);
    const where: Prisma.BranchDeliveryWhereInput = { tenantId };

    const [items, total] = await Promise.all([
      prisma.branchDelivery.findMany({
        where,
        include: deliveryListInclude,
        orderBy: { createdAt: "desc" },
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
  ) {
    const { limit, page, skip } = resolvePagination(pagination);
    const where: Prisma.BranchTransferWhereInput = { tenantId };

    const [items, total] = await Promise.all([
      prisma.branchTransfer.findMany({
        where,
        include: transferListInclude,
        orderBy: { createdAt: "desc" },
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
  ) {
    const { limit, page, skip } = resolvePagination(pagination);
    const where: Prisma.BranchPulloutWhereInput = { tenantId };

    const [items, total] = await Promise.all([
      prisma.branchPullout.findMany({
        where,
        include: pulloutListInclude,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.branchPullout.count({ where }),
    ]);

    return toPaginatedResult(items, total, page, limit);
  },
};
