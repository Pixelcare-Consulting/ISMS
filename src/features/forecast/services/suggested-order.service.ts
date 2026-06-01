import { auditService } from "@/features/audit/services/audit.service";
import { forecastRepository } from "@/features/forecast/repositories/forecast.repository";
import { orderRepository } from "@/features/orders/repositories/order.repository";
import { getOrderApprovalChain } from "@/features/orders/constants/order-workflow";
import { prisma } from "@/lib/database/client";
import {
  resolvePagination,
  toPaginatedResult,
  type PaginationInput,
} from "@/lib/shared/pagination";
import type { Prisma } from "@prisma/client";

function draftSuggestedOrdersWhere(
  tenantId: string,
  filters?: { branchId?: string; q?: string },
): Prisma.BranchOrderWhereInput {
  const q = filters?.q?.trim();
  return {
    tenantId,
    orderType: "auto_replenish",
    status: "draft",
    ...(filters?.branchId ? { branchId: filters.branchId } : {}),
    ...(q
      ? {
          OR: [
            { orderNumber: { contains: q, mode: "insensitive" } },
            { branch: { name: { contains: q, mode: "insensitive" } } },
            {
              details: {
                some: { model: { skuCode: { contains: q, mode: "insensitive" } } },
              },
            },
          ],
        }
      : {}),
  };
}

function nextOrderNumber() {
  return `ORD-${Date.now().toString(36).toUpperCase()}`;
}

export const suggestedOrderService = {
  async generateSuggestedOrders(
    tenantId: string,
    periodId: string,
    createdById: string,
  ) {
    const period = await forecastRepository.findPeriodById(tenantId, periodId);
    if (!period) throw new Error("Planning period not found");

    const allocations = await forecastRepository.listAllocationsForPeriod(
      tenantId,
      periodId,
    );
    if (allocations.length === 0) {
      throw new Error("No allocation gaps. Run allocation first.");
    }

    const byBranch = new Map<string, typeof allocations>();
    for (const row of allocations) {
      const list = byBranch.get(row.branchId) ?? [];
      list.push(row);
      byBranch.set(row.branchId, list);
    }

    const created: { id: string; orderNumber: string; branchName: string }[] = [];

    for (const [branchId, lines] of byBranch) {
      const existingDraft = await prisma.branchOrder.findFirst({
        where: {
          tenantId,
          branchId,
          orderType: "auto_replenish",
          status: "draft",
        },
      });
      if (existingDraft) continue;

      const approvalChain = getOrderApprovalChain("auto_replenish");
      const order = await prisma.branchOrder.create({
        data: {
          tenantId,
          branchId,
          orderType: "auto_replenish",
          orderNumber: nextOrderNumber(),
          status: "draft",
          createdById,
          notes: `Suggested replenishment (${period.label})`,
          details: {
            create: lines.map((line) => ({
              modelId: line.modelId,
              quantity: line.gapQty,
            })),
          },
          approvalLevels: {
            create: approvalChain.map((step) => ({
              level: step.level,
              roleSlug: step.roleSlug,
            })),
          },
        },
        include: {
          branch: { select: { name: true } },
        },
      });

      created.push({
        id: order.id,
        orderNumber: order.orderNumber,
        branchName: order.branch.name,
      });
    }

    await auditService.log({
      tenantId,
      userId: createdById,
      action: "forecast.suggested_orders_generated",
      entityType: "PlanningPeriod",
      entityId: periodId,
      metadata: { orderCount: created.length },
    });

    return created;
  },

  async submitDraftOrdersForReview(tenantId: string, actorUserId: string) {
    const drafts = await prisma.branchOrder.findMany({
      where: { tenantId, orderType: "auto_replenish", status: "draft" },
      include: { branch: { select: { name: true } } },
    });

    if (drafts.length === 0) {
      throw new Error("No draft suggested orders to submit");
    }

    for (const order of drafts) {
      await orderRepository.updateStatus(tenantId, order.id, "pending_tl");
    }

    await auditService.log({
      tenantId,
      userId: actorUserId,
      action: "forecast.suggested_orders_submitted",
      entityType: "BranchOrder",
      entityId: drafts.map((o) => o.id).join(","),
      metadata: { count: drafts.length },
    });

    return drafts.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      branchName: o.branch.name,
    }));
  },

  listDraftSuggestedOrders(tenantId: string) {
    return prisma.branchOrder.findMany({
      where: draftSuggestedOrdersWhere(tenantId),
      include: {
        branch: { select: { id: true, name: true } },
        details: {
          include: { model: { select: { skuCode: true, name: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  async listDraftSuggestedOrdersPaginated(
    tenantId: string,
    pagination?: PaginationInput,
    filters?: { branchId?: string; q?: string },
  ) {
    const { limit, page, skip } = resolvePagination(pagination);
    const where = draftSuggestedOrdersWhere(tenantId, filters);

    const [items, total] = await Promise.all([
      prisma.branchOrder.findMany({
        where,
        include: {
          branch: { select: { id: true, name: true } },
          details: {
            include: { model: { select: { skuCode: true, name: true } } },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.branchOrder.count({ where }),
    ]);

    return toPaginatedResult(items, total, page, limit);
  },
};
