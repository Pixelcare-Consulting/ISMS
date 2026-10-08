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

  async createTransfer(
    tenantId: string,
    data: {
      fromBranchId: string;
      toBranchId: string;
      notes?: string;
      actorUserId?: string;
    },
  ) {
    const statusCodeId = await reasonStatusService.requireCodeId(
      tenantId,
      "transfer_workflow",
      "pending_tl",
    );
    return prisma.branchTransfer.create({
      data: {
        tenantId,
        fromBranchId: data.fromBranchId,
        toBranchId: data.toBranchId,
        transferNo: `XFR-${Date.now().toString(36).toUpperCase()}`,
        notes: data.notes,
        statusCodeId,
        createdById: data.actorUserId,
      },
      include: {
        fromBranch: { select: { name: true } },
        toBranch: { select: { name: true } },
      },
    });
  },

  async createPullout(
    tenantId: string,
    data: { branchId: string; warehouseId: string; notes?: string },
  ) {
    const statusCodeId = await reasonStatusService.requireCodeId(
      tenantId,
      "pullout_workflow",
      "pending_tl",
    );
    return prisma.branchPullout.create({
      data: {
        tenantId,
        branchId: data.branchId,
        warehouseId: data.warehouseId,
        pulloutNo: `PLT-${Date.now().toString(36).toUpperCase()}`,
        notes: data.notes,
        statusCodeId,
      },
      include: { branch: { select: { name: true } } },
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
