import { prisma } from "@/lib/database/client";
import { resolvePagination, toPaginatedResult } from "@/lib/shared/pagination";
import {
  getInitialOrderStatus,
  getOrderApprovalChain,
} from "@/features/orders/constants/order-workflow";
import { nextSalesOrderNumber } from "@/features/orders/utils/next-sales-order-number";
import type { BranchOrderStatus, BranchOrderType } from "@prisma/client";
import type { Prisma } from "@prisma/client";

const orderListInclude = {
  branch: { select: { id: true, name: true, sapCode: true, deliverySchedule: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  details: {
    include: {
      model: { select: { id: true, skuCode: true, name: true, brandId: true } },
    },
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

  async create(
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

    const orderNumber = await nextSalesOrderNumber(tenantId);

    return prisma.branchOrder.create({
      data: {
        tenantId,
        branchId: data.branchId,
        orderType: data.orderType,
        orderNumber,
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
      include: {
        branch: { select: { name: true } },
        details: { include: { model: { select: { skuCode: true } } } },
        approvalLevels: true,
      },
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

  async finalizeApproved(
    tenantId: string,
    orderId: string,
    data: {
      approvedById: string;
      spaRemarks?: string;
      deliveryDueDate?: Date;
      brandId?: string | null;
      lineApprovedQty: { detailId: string; approvedQty: number }[];
    },
  ) {
    const processedAt = new Date();

    await prisma.$transaction([
      ...data.lineApprovedQty.map((line) =>
        prisma.branchOrderDetail.update({
          where: { id: line.detailId },
          data: { approvedQty: line.approvedQty },
        }),
      ),
      prisma.branchOrder.update({
        where: { id: orderId, tenantId },
        data: {
          status: "approved",
          approvedById: data.approvedById,
          processedAt,
          spaRemarks: data.spaRemarks ?? null,
          deliveryDueDate: data.deliveryDueDate ?? null,
          brandId: data.brandId ?? null,
        },
      }),
    ]);
  },
};
