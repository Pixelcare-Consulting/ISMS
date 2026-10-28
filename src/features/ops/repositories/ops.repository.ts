import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/client";
import { latestReturnInclude } from "@/features/logistics/repositories/logistics.repository";
import { DELIVERY_WORKFLOW_CODE } from "@/features/logistics/constants/workflow-codes";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";

export const opsRepository = {
  listDeliveries(tenantId: string, branchIds?: string[]) {
    return prisma.branchDelivery.findMany({
      where: {
        tenantId,
        ...(branchIds?.length ? { branchId: { in: branchIds } } : {}),
      },
      include: {
        branch: { select: { name: true, sapCode: true } },
        statusCode: { select: { id: true, code: true, name: true } },
        order: { select: { sapDocType: true } },
        ...latestReturnInclude,
      },
      orderBy: { createdAt: "desc" },
    });
  },

  listTransfers(tenantId: string, extra?: Prisma.BranchTransferWhereInput) {
    return prisma.branchTransfer.findMany({
      where: { tenantId, ...extra },
      include: {
        fromBranch: { select: { name: true } },
        toBranch: { select: { name: true } },
        statusCode: { select: { id: true, code: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  listPullouts(tenantId: string, branchIds?: string[]) {
    return prisma.branchPullout.findMany({
      where: {
        tenantId,
        ...(branchIds?.length ? { branchId: { in: branchIds } } : {}),
      },
      include: {
        branch: { select: { name: true } },
        statusCode: { select: { id: true, code: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  async createDelivery(tenantId: string, branchId: string, deliveryNo: string) {
    const statusCodeId = await reasonStatusService.requireCodeId(
      tenantId,
      "delivery_workflow",
      DELIVERY_WORKFLOW_CODE.approved,
    );
    return prisma.branchDelivery.create({
      data: { tenantId, branchId, deliveryNo, statusCodeId },
    });
  },

  async countPendingDeliveries(tenantId: string) {
    const pendingCode = await reasonStatusService.requireCodeId(
      tenantId,
      "delivery_workflow",
      DELIVERY_WORKFLOW_CODE.pending,
    );
    return prisma.branchDelivery.count({
      where: { tenantId, statusCodeId: pendingCode },
    });
  },
};
