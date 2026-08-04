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

  /**
   * Accept delivery with line-scoped DIT→STK.
   * Header-only deliveries (no lines) skip inventory move — do not branch-wide promote.
   */
  async acceptDelivery(
    tenantId: string,
    id: string,
    actorUserId: string,
    acceptedCodeId: string,
    ditCodeId: string,
    stkCodeId: string,
  ) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.branchDelivery.findFirst({
        where: { id, tenantId },
        include: {
          lines: { select: { serialNumberId: true } },
          branch: { select: { name: true } },
          order: { select: { orderNumber: true } },
        },
      });
      if (!existing) {
        throw new Error("Delivery not found");
      }

      const serialNumberIds = existing.lines.map((line) => line.serialNumberId);
      let movedCount = 0;
      if (serialNumberIds.length) {
        const moved = await tx.branchInventory.updateMany({
          where: {
            tenantId,
            branchId: existing.branchId,
            statusCodeId: ditCodeId,
            serialNumberId: { in: serialNumberIds },
          },
          data: { statusCodeId: stkCodeId, updatedById: actorUserId },
        });
        if (moved.count !== serialNumberIds.length) {
          throw new Error("Some serials are not in-transit at this branch");
        }
        movedCount = moved.count;
      }

      const delivery = await tx.branchDelivery.update({
        where: { id, tenantId },
        data: { statusCodeId: acceptedCodeId, acceptedAt: new Date() },
        include: {
          branch: { select: { name: true } },
          order: { select: { orderNumber: true } },
        },
      });

      return { ...delivery, movedCount };
    });
  },

  async rejectDelivery(tenantId: string, id: string) {
    const statusCodeId = await reasonStatusService.requireCodeId(
      tenantId,
      "delivery_workflow",
      "rejected",
    );
    return prisma.branchDelivery.update({
      where: { id, tenantId },
      data: { statusCodeId },
      include: {
        branch: { select: { name: true } },
        order: { select: { orderNumber: true } },
      },
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
