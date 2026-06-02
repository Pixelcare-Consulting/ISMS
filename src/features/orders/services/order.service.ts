import type { BranchOrderStatus, BranchOrderType } from "@prisma/client";

import { auditService } from "@/features/audit/services/audit.service";
import { BRANCH_ORDER_TYPE_LABELS } from "@/features/orders/constants/order-status";
import {
  canApproveOrder,
  getApprovalLevelForStatus,
  getInitialOrderStatus,
  getRoleSlugForApproval,
  nextStatusAfterApprove,
} from "@/features/orders/constants/order-workflow";
import { orderRepository } from "@/features/orders/repositories/order.repository";
import { sapService } from "@/features/sap/services/sap.service";
import { planogramRepository } from "@/features/planogram/repositories/planogram.repository";
import { masterDataRepository } from "@/features/master-data/repositories/master-data.repository";
import { getUserBranchIds } from "@/lib/aor/scope";
import { resolveDeliveryDueDate } from "@/features/orders/utils/delivery-schedule";
import { sendWorkflowEmail } from "@/lib/notifications/workflow-email";

function buildLinesSummary(
  details: { quantity: number; model: { skuCode: string } }[],
): string {
  return details.map((d) => `${d.model.skuCode}×${d.quantity}`).join(", ");
}

function orderAuditMetadata(order: {
  orderNumber: string;
  orderType: BranchOrderType;
  branch: { name: string };
  details: { quantity: number; model: { skuCode: string } }[];
  status?: BranchOrderStatus;
}) {
  return {
    orderNumber: order.orderNumber,
    orderType: order.orderType,
    orderTypeLabel: BRANCH_ORDER_TYPE_LABELS[order.orderType],
    branchName: order.branch.name,
    linesSummary: buildLinesSummary(order.details),
    ...(order.status ? { status: order.status } : {}),
  };
}

function pendingApprovalEmail(status: BranchOrderStatus, orderType: BranchOrderType) {
  if (orderType === "special" && status === "pending_sp") {
    return "Special order submitted — pending Supply Planning approval.";
  }
  if (status === "pending_ps") return "Manual order submitted — pending PS review.";
  if (status === "pending_tl") return "Order pending Team Leader review.";
  if (status === "pending_sp") return "Order pending Supply Planning approval.";
  return `Order is pending approval (${status}).`;
}

async function validateOrderLines(
  tenantId: string,
  branchId: string,
  orderType: BranchOrderType,
  details: { modelId: string; quantity: number }[],
) {
  if (details.length === 0) throw new Error("Order must include at least one line");

  for (const line of details) {
    if (line.quantity < 1) throw new Error("Quantity must be at least 1");

    const model = await masterDataRepository.findModel(tenantId, line.modelId);
    if (!model) throw new Error(`Model not found: ${line.modelId}`);

    if (model.status === "hold" || model.status === "retired") {
      throw new Error(`SKU ${model.skuCode} is ${model.status} and cannot be ordered`);
    }

    if (orderType === "special") continue;

    const planogram = await planogramRepository.findPlanogramEntry(
      tenantId,
      branchId,
      line.modelId,
    );
    if (!planogram) {
      throw new Error(
        `SKU ${model.skuCode} is not on the branch planogram. Use a special order for off-planogram SKUs.`,
      );
    }

    const stockCount = await planogramRepository.countStockForModel(
      tenantId,
      branchId,
      line.modelId,
    );
    const remainingCapacity = Math.max(0, planogram.maxQty - stockCount);
    if (line.quantity > remainingCapacity) {
      throw new Error(
        `Quantity for ${model.skuCode} exceeds shelf capacity (${remainingCapacity} remaining of ${planogram.maxQty} max)`,
      );
    }
  }
}

export const orderService = {
  async list(
    tenantId: string,
    userId: string,
    hasFullAccess: boolean,
    pagination?: { page?: number; limit?: number },
  ) {
    const branchIds = hasFullAccess ? null : await getUserBranchIds(tenantId, userId);
    return orderRepository.listForTenant(tenantId, branchIds, pagination);
  },

  async listModelsForOrder(
    tenantId: string,
    branchId: string,
    orderType: BranchOrderType,
  ) {
    if (orderType === "special") {
      const models = await masterDataRepository.listModels(tenantId);
      return models
        .filter((m) => m.status === "active")
        .map((m) => ({
          id: m.id,
          skuCode: m.skuCode,
          name: m.name,
          maxQty: null as number | null,
          onPlanogram: false,
        }));
    }

    const entries = await planogramRepository.listPlanogramModelsForOrder(tenantId, branchId);
    const stockCounts = await planogramRepository.countStockByBranchModels(
      tenantId,
      branchId,
      entries.map((e) => e.model.id),
    );
    return entries.map((e) => {
      const stockCount = stockCounts.get(e.model.id) ?? 0;
      const remainingCapacity = Math.max(0, e.maxQty - stockCount);
      return {
        id: e.model.id,
        skuCode: e.model.skuCode,
        name: e.model.name,
        maxQty: e.maxQty,
        stockCount,
        remainingCapacity,
        onPlanogram: true,
      };
    });
  },

  async create(
    tenantId: string,
    userId: string,
    data: {
      branchId: string;
      orderType: BranchOrderType;
      notes?: string;
      details: { modelId: string; quantity: number }[];
    },
  ) {
    await validateOrderLines(tenantId, data.branchId, data.orderType, data.details);

    const offPlanogramSkus: string[] = [];
    if (data.orderType === "special") {
      for (const line of data.details) {
        const onPlanogram = await planogramRepository.findPlanogramEntry(
          tenantId,
          data.branchId,
          line.modelId,
        );
        if (!onPlanogram) {
          const model = await masterDataRepository.findModel(tenantId, line.modelId);
          if (model) offPlanogramSkus.push(model.skuCode);
        }
      }
    }

    const notes =
      data.orderType === "special" && offPlanogramSkus.length > 0
        ? [data.notes, `[Special order — off-planogram: ${offPlanogramSkus.join(", ")}]`]
            .filter(Boolean)
            .join("\n")
        : data.notes;

    const order = await orderRepository.create(tenantId, {
      ...data,
      notes,
      createdById: userId,
    });

    await auditService.log({
      tenantId,
      userId,
      action: "order.created",
      entityType: "BranchOrder",
      entityId: order.id,
      metadata: {
        ...orderAuditMetadata(order),
        offPlanogram: offPlanogramSkus,
      },
    });

    await sendWorkflowEmail({
      subject: `Branch order ${order.id.slice(-8)} submitted`,
      body: pendingApprovalEmail(getInitialOrderStatus(data.orderType), data.orderType),
    });

    return order;
  },

  async approve(
    tenantId: string,
    userId: string,
    orderId: string,
    roleSlugs: string[],
    input?: {
      comment?: string;
      lineAdjustments?: { detailId: string; approvedQty: number }[];
      deliveryDueDate?: Date;
    },
  ) {
    const order = await orderRepository.findById(tenantId, orderId);
    if (!order) throw new Error("Order not found");
    if (!canApproveOrder(order.status, order.orderType, roleSlugs)) {
      throw new Error("Not authorized for this approval step");
    }

    const roleSlug = getRoleSlugForApproval(order.status, order.orderType);
    const level = getApprovalLevelForStatus(order.status, order.orderType);
    const comment = input?.comment;

    await orderRepository.addApproval(orderId, {
      level,
      roleSlug,
      approvedById: userId,
      comment,
    });

    const nextStatus = nextStatusAfterApprove(order.status, order.orderType);
    const isFinal = nextStatus === "approved";

    const deliveryResolution =
      isFinal && input?.deliveryDueDate
        ? resolveDeliveryDueDate(
            input.deliveryDueDate.toISOString().slice(0, 10),
            order.branch.deliverySchedule,
          )
        : { dueDate: null as Date | null, rescheduled: false, rescheduledFrom: undefined as string | undefined };

    if (isFinal) {
      const adjustmentMap = new Map(
        (input?.lineAdjustments ?? []).map((l) => [l.detailId, l.approvedQty]),
      );

      for (const line of order.details) {
        const qty = adjustmentMap.get(line.id);
        if (qty != null && (qty < 1 || qty > line.quantity)) {
          throw new Error(
            `Approved quantity must be between 1 and ordered quantity (${line.quantity})`,
          );
        }
      }

      const lineApprovedQty = order.details.map((line) => ({
        detailId: line.id,
        approvedQty: adjustmentMap.get(line.id) ?? line.quantity,
      }));

      const brandIds = order.details
        .map((d) => d.model.brandId)
        .filter((id): id is string => Boolean(id));
      const brandId =
        brandIds.length > 0
          ? [...new Set(brandIds)].length === 1
            ? brandIds[0]
            : null
          : null;

      await orderRepository.finalizeApproved(tenantId, orderId, {
        approvedById: userId,
        spaRemarks: comment,
        deliveryDueDate: deliveryResolution.dueDate ?? undefined,
        brandId,
        lineApprovedQty,
      });

      const refreshed = await orderRepository.findById(tenantId, orderId);
      if (refreshed) {
        await sapService.emitApprovedOrder(tenantId, {
          id: refreshed.id,
          orderNumber: refreshed.orderNumber,
          branchId: refreshed.branchId,
          branchSapCode: refreshed.branch.sapCode,
          processedAt: refreshed.processedAt,
          lines: refreshed.details.map((d) => ({
            skuCode: d.model.skuCode,
            approvedQty: d.approvedQty,
            quantity: d.quantity,
          })),
        });
        await sapService.processPendingJobs(tenantId, userId);
      }
    } else {
      await orderRepository.updateStatus(tenantId, orderId, nextStatus);
    }

    await auditService.log({
      tenantId,
      userId,
      action: isFinal ? "order.approved" : "order.approval_step",
      entityType: "BranchOrder",
      entityId: orderId,
      metadata: {
        ...orderAuditMetadata(order),
        from: order.status,
        to: nextStatus,
        roleSlug,
        ...(isFinal && input?.deliveryDueDate
          ? {
              deliveryDueDateRequested: input.deliveryDueDate.toISOString().slice(0, 10),
              deliveryDueDateRescheduled: deliveryResolution.rescheduled,
              ...(deliveryResolution.rescheduledFrom
                ? { deliveryDueDateRescheduledFrom: deliveryResolution.rescheduledFrom }
                : {}),
              ...(deliveryResolution.dueDate
                ? { deliveryDueDateFinal: deliveryResolution.dueDate.toISOString().slice(0, 10) }
                : {}),
            }
          : {}),
      },
    });

    await sendWorkflowEmail({
      subject: `Branch order — ${isFinal ? "approved" : "next approval"}`,
      body: isFinal
        ? "Order approved. A branch delivery has been queued for logistics fulfillment."
        : `Order status is now ${nextStatus}.`,
    });
  },

  async reject(tenantId: string, userId: string, orderId: string, comment?: string) {
    const order = await orderRepository.findById(tenantId, orderId);
    if (!order) throw new Error("Order not found");

    const level = getApprovalLevelForStatus(order.status, order.orderType);

    await orderRepository.updateStatus(tenantId, orderId, "rejected");
    await orderRepository.addRejection(orderId, {
      level,
      roleSlug: "reviewer",
      comment,
    });

    await auditService.log({
      tenantId,
      userId,
      action: "order.rejected",
      entityType: "BranchOrder",
      entityId: orderId,
      metadata: {
        ...orderAuditMetadata(order),
        from: order.status,
        to: "rejected",
        ...(comment ? { comment } : {}),
      },
    });
  },

  countPendingApprovals(tenantId: string) {
    return orderRepository.countPendingByStatus(tenantId, [
      "pending_ps",
      "pending_tl",
      "pending_sp",
      "pending_logistics",
    ]);
  },
};
