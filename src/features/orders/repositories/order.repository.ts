import { prisma } from "@/lib/database/client";
import { resolvePagination, toPaginatedResult } from "@/lib/shared/pagination";
import {
  getInitialOrderStatus,
  getOrderApprovalChain,
} from "@/features/orders/constants/order-workflow";
import type { BranchOrderStatus, BranchOrderType } from "@prisma/client";
import type { Prisma } from "@prisma/client";

function nextOrderNumber() {
  return `ORD-${Date.now().toString(36).toUpperCase()}`;
}

const orderListInclude = {
  branch: { select: { id: true, name: true, sapCode: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  details: {
    include: { model: { select: { id: true, skuCode: true, name: true } } },
  },
  approvalLevels: { orderBy: { level: "asc" as const } },
} satisfies Prisma.BranchOrderInclude;

export const orderRepository = {
  async listForTenant(
    tenantId: string,
    branchIds: string[] | null,
    pagination?: { page?: number; limit?: number },
  ) {
    const { limit, page, skip } = resolvePagination(pagination);
    const where: Prisma.BranchOrderWhereInput = {
      tenantId,
      ...(branchIds?.length ? { branchId: { in: branchIds } } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.branchOrder.findMany({
        where,
        include: orderListInclude,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.branchOrder.count({ where }),
    ]);

    return toPaginatedResult(items, total, page, limit);
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
    const approvalChain = getOrderApprovalChain(data.orderType);
    const initialStatus = getInitialOrderStatus(data.orderType);

    return prisma.branchOrder.create({
      data: {
        tenantId,
        branchId: data.branchId,
        orderType: data.orderType,
        orderNumber: nextOrderNumber(),
        status: initialStatus,
        createdById: data.createdById,
        notes: data.notes,
        details: { create: data.details },
        approvalLevels: {
          create: approvalChain.map((step) => ({
            level: step.level,
            roleSlug: step.roleSlug,
          })),
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
