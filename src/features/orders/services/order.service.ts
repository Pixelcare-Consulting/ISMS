import type { BranchOrderType } from "@prisma/client";

import { auditService } from "@/features/audit/services/audit.service";
import {
  canApproveOrder,
  nextStatusAfterApprove,
} from "@/features/orders/constants/order-workflow";
import { orderRepository } from "@/features/orders/repositories/order.repository";
import { planogramRepository } from "@/features/planogram/repositories/planogram.repository";
import { masterDataRepository } from "@/features/master-data/repositories/master-data.repository";
import { getUserBranchIds } from "@/lib/aor/scope";
import { sendWorkflowEmail } from "@/lib/notifications/workflow-email";

const LEVEL_BY_STATUS = {
  pending_tl: 1,
  pending_sp: 2,
  pending_logistics: 3,
} as const;

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
  async list(tenantId: string, userId: string, hasFullAccess: boolean) {
    const branchIds = hasFullAccess ? null : await getUserBranchIds(tenantId, userId);
    return orderRepository.listForTenant(tenantId, branchIds);
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
    return entries.map((e) => ({
      id: e.model.id,
      skuCode: e.model.skuCode,
      name: e.model.name,
      maxQty: e.maxQty,
      onPlanogram: true,
    }));
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
        branchId: data.branchId,
        orderType: data.orderType,
        offPlanogram: offPlanogramSkus,
      },
    });

    await sendWorkflowEmail({
      subject: `Branch order ${order.id.slice(-8)} submitted`,
      body: `Order is pending TL approval.`,
    });

    return order;
  },

  async approve(
    tenantId: string,
    userId: string,
    orderId: string,
    roleSlugs: string[],
    comment?: string,
  ) {
    const order = await orderRepository.findById(tenantId, orderId);
    if (!order) throw new Error("Order not found");
    if (!canApproveOrder(order.status, roleSlugs)) {
      throw new Error("Not authorized for this approval step");
    }

    const roleSlug =
      order.status === "pending_tl"
        ? "tl"
        : order.status === "pending_sp"
          ? "sp"
          : "logistics";

    const level = LEVEL_BY_STATUS[order.status as keyof typeof LEVEL_BY_STATUS] ?? 1;

    await orderRepository.addApproval(orderId, {
      level,
      roleSlug,
      approvedById: userId,
      comment,
    });

    const nextStatus = nextStatusAfterApprove(order.status);
    const isFinal = nextStatus === "approved";

    await orderRepository.updateStatus(tenantId, orderId, nextStatus, {
      ...(isFinal ? { approvedById: userId } : {}),
    });

    await auditService.log({
      tenantId,
      userId,
      action: isFinal ? "order.approved" : "order.approval_step",
      entityType: "BranchOrder",
      entityId: orderId,
      metadata: { from: order.status, to: nextStatus, roleSlug },
    });

    await sendWorkflowEmail({
      subject: `Branch order — ${isFinal ? "approved" : "next approval"}`,
      body: `Order status is now ${nextStatus}.`,
    });
  },

  async reject(tenantId: string, userId: string, orderId: string, comment?: string) {
    const order = await orderRepository.findById(tenantId, orderId);
    if (!order) throw new Error("Order not found");

    const level = LEVEL_BY_STATUS[order.status as keyof typeof LEVEL_BY_STATUS] ?? 1;

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
    });
  },

  countPendingApprovals(tenantId: string) {
    return orderRepository.countPendingByStatus(tenantId, [
      "pending_tl",
      "pending_sp",
      "pending_logistics",
    ]);
  },
};
