import { prisma } from "@/lib/database/client";
import type { BranchOrderStatus, BranchOrderType } from "@prisma/client";

function nextOrderNumber() {
  return `ORD-${Date.now().toString(36).toUpperCase()}`;
}

export const orderRepository = {
  listForTenant(tenantId: string, branchIds: string[] | null) {
    return prisma.branchOrder.findMany({
      where: {
        tenantId,
        ...(branchIds?.length ? { branchId: { in: branchIds } } : {}),
      },
      include: {
        branch: { select: { id: true, name: true, sapCode: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        details: {
          include: { model: { select: { id: true, skuCode: true, name: true } } },
        },
        approvalLevels: { orderBy: { level: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  findById(tenantId: string, id: string) {
    return prisma.branchOrder.findFirst({
      where: { id, tenantId },
      include: {
        branch: true,
        details: { include: { model: true } },
        approvalLevels: { orderBy: { level: "asc" } },
      },
    });
  },

  create(
    tenantId: string,
    data: {
      branchId: string;
      orderType: BranchOrderType;
      createdById: string;
      notes?: string;
      details: { modelId: string; quantity: number }[];
    },
  ) {
    return prisma.branchOrder.create({
      data: {
        tenantId,
        branchId: data.branchId,
        orderType: data.orderType,
        orderNumber: nextOrderNumber(),
        status: "pending_tl",
        createdById: data.createdById,
        notes: data.notes,
        details: { create: data.details },
        approvalLevels: {
          create: [
            { level: 1, roleSlug: "tl" },
            { level: 2, roleSlug: "sp" },
            { level: 3, roleSlug: "logistics" },
          ],
        },
      },
      include: { details: true, approvalLevels: true },
    });
  },

  updateStatus(
    tenantId: string,
    id: string,
    status: BranchOrderStatus,
    extra?: { approvedById?: string },
  ) {
    return prisma.branchOrder.update({
      where: { id, tenantId },
      data: { status, ...(extra?.approvedById ? { approvedById: extra.approvedById } : {}) },
    });
  },

  addApproval(
    orderId: string,
    data: { level: number; roleSlug: string; approvedById: string; comment?: string },
  ) {
    return prisma.branchOrderApprovalLevel.update({
      where: { orderId_level: { orderId, level: data.level } },
      data: {
        approvedAt: new Date(),
        approvedById: data.approvedById,
        comment: data.comment ?? null,
      },
    });
  },

  addRejection(
    orderId: string,
    data: { level: number; roleSlug: string; comment?: string },
  ) {
    return prisma.branchOrderApprovalLevel.update({
      where: { orderId_level: { orderId, level: data.level } },
      data: { rejectedAt: new Date(), comment: data.comment ?? null },
    });
  },

  countPendingByStatus(tenantId: string, statuses: BranchOrderStatus[]) {
    return prisma.branchOrder.count({
      where: { tenantId, status: { in: statuses } },
    });
  },
};
