import { prisma } from "@/lib/database/client";
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
      },
      orderBy: { createdAt: "desc" },
    });
  },

  listTransfers(tenantId: string) {
    return prisma.branchTransfer.findMany({
      where: { tenantId },
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
      "approved",
    );
    return prisma.branchDelivery.create({
      data: { tenantId, branchId, deliveryNo, statusCodeId },
    });
  },

  async countPendingDeliveries(tenantId: string) {
    const pendingCode = await reasonStatusService.requireCodeId(
      tenantId,
      "delivery_workflow",
      "pending",
    );
    return prisma.branchDelivery.count({
      where: { tenantId, statusCodeId: pendingCode },
    });
  },
};
