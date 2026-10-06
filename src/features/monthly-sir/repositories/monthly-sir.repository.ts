import type { MonthlySirRequestStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/client";
import { resolvePagination, toPaginatedResult } from "@/lib/shared/pagination";

const requestInclude = {
  branch: { select: { id: true, name: true, sapCode: true } },
  requestedBy: { select: { id: true, name: true, email: true } },
  reviewedBy: { select: { id: true, name: true, email: true } },
  uploadedBy: { select: { id: true, name: true, email: true } },
  stockCountSession: {
    select: { id: true, sessionNo: true, status: true },
  },
} satisfies Prisma.MonthlySirRequestInclude;

export const monthlySirRepository = {
  list(
    tenantId: string,
    filters: {
      branchIds?: string[];
      branchId?: string;
      status?: MonthlySirRequestStatus;
      page?: number;
      limit?: number;
    },
  ) {
    const { page, limit, skip } = resolvePagination(filters);
    if (filters.branchIds && filters.branchIds.length === 0) {
      return Promise.resolve(toPaginatedResult([], 0, page, limit));
    }
    const where: Prisma.MonthlySirRequestWhereInput = {
      tenantId,
      ...(filters.branchId
        ? { branchId: filters.branchId }
        : filters.branchIds
          ? { branchId: { in: filters.branchIds } }
          : {}),
      ...(filters.status ? { status: filters.status } : {}),
    };
    return Promise.all([
      prisma.monthlySirRequest.findMany({
        where,
        include: requestInclude,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.monthlySirRequest.count({ where }),
    ]).then(([items, total]) => toPaginatedResult(items, total, page, limit));
  },

  findById(tenantId: string, id: string) {
    return prisma.monthlySirRequest.findFirst({
      where: { id, tenantId },
      include: requestInclude,
    });
  },

  create(data: {
    tenantId: string;
    branchId: string;
    requestedById: string;
    purpose: string;
  }) {
    return prisma.monthlySirRequest.create({
      data,
      include: requestInclude,
    });
  },

  claimForReview(tenantId: string, id: string, status: MonthlySirRequestStatus) {
    return prisma.monthlySirRequest.updateMany({
      where: { id, tenantId, status: "pending" },
      data: { status },
    });
  },

  finishApproval(
    tenantId: string,
    id: string,
    data: {
      stockCountSessionId: string;
      reviewedById: string;
      reviewRemarks?: string;
    },
  ) {
    return prisma.monthlySirRequest.update({
      where: { id, tenantId },
      data: {
        ...data,
        reviewedAt: new Date(),
      },
      include: requestInclude,
    });
  },

  finishRejection(
    tenantId: string,
    id: string,
    reviewedById: string,
    reviewRemarks?: string,
  ) {
    return prisma.monthlySirRequest.update({
      where: { id, tenantId },
      data: { reviewedById, reviewRemarks, reviewedAt: new Date() },
      include: requestInclude,
    });
  },

  releaseReviewClaim(tenantId: string, id: string) {
    return prisma.monthlySirRequest.updateMany({
      where: { id, tenantId, status: "approved", stockCountSessionId: null },
      data: { status: "pending" },
    });
  },

  markUploaded(tenantId: string, id: string, uploadedById: string) {
    return prisma.monthlySirRequest.update({
      where: { id, tenantId },
      data: { uploadedAt: new Date(), uploadedById },
    });
  },
};
