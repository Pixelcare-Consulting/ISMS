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
      "pending",
    );
    return prisma.branchDelivery.create({
      data: { tenantId, branchId, deliveryNo, statusCodeId },
    });
  },

  async acceptDelivery(tenantId: string, id: string) {
    const statusCodeId = await reasonStatusService.requireCodeId(
      tenantId,
      "delivery_workflow",
      "accepted",
    );
    return prisma.branchDelivery.update({
      where: { id, tenantId },
      data: { statusCodeId, acceptedAt: new Date() },
      include: {
        branch: { select: { name: true } },
        order: { select: { orderNumber: true } },
      },
    });
  },

  promoteInTransitToStock(
    tenantId: string,
    branchId: string,
    ditCodeId: string,
    stkCodeId: string,
    updatedById: string,
  ) {
    return prisma.branchInventory.updateMany({
      where: {
        tenantId,
        branchId,
        statusCodeId: ditCodeId,
      },
      data: { statusCodeId: stkCodeId, updatedById },
    });
  },

  async createTransfer(
    tenantId: string,
    data: { fromBranchId: string; toBranchId: string; notes?: string },
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
