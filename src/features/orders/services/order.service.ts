import type { BranchOrderStatus, BranchOrderType, Prisma } from "@prisma/client";

import { aorRepository } from "@/features/aors/repositories/aor.repository";
import { auditService } from "@/features/audit/services/audit.service";
import { hasOrdersForceCancelPermission } from "@/features/orders/constants/order-permissions";
import {
  BRANCH_ORDER_STATUS_LABELS,
  BRANCH_ORDER_TYPE_LABELS,
} from "@/features/orders/constants/order-status";
import {
  canAdminForceCancelOrder,
  canApproveOrder,
  canDeleteDraftOrder,
  declineOrderStatus,
  getApprovalLevelForStatus,
  getInitialOrderStatus,
  getOrderApprovalChain,
  getRoleSlugForApproval,
  isOrderEditable,
  isSuperAdminOrderOverride,
  isSupplyPlanningApprovalStep,
  nextStatusAfterApprove,
  SUPPLY_PLANNING_APPROVER_SLUGS,
} from "@/features/orders/constants/order-workflow";
import { SapOrderPostRejectedError } from "@/features/orders/lib/sap-order-rejection";
import { notificationService } from "@/features/notifications/services/notification.service";
import {
  ORDER_CHANGED_MESSAGE,
  orderRepository,
} from "@/features/orders/repositories/order.repository";
import { suggestionApplyService } from "@/features/orders/services/suggestion-apply.service";
import { resolveOrderSapRouting } from "@/features/orders/services/order-sap-routing";
import { validateOrderLines } from "@/features/orders/services/order-line-validation";
import type {
  OrderListSort,
  OrderListSortDir,
} from "@/features/orders/repositories/order.repository";
import { manualSpecialQueueStatusKeys } from "@/features/orders/lib/manual-special-order-scope";
import {
  hasQueryableTypeScopes,
  type OrderTypeScope,
} from "@/features/orders/lib/order-scope-where";
import { SAP_REFERENCE_TYPES } from "@/features/sap/constants/sap-job-types";
import { sapService } from "@/features/sap/services/sap.service";
import { branchQuotaService } from "@/features/branch-quotas/services/branch-quota.service";
import { planogramRepository } from "@/features/planogram/repositories/planogram.repository";
import { masterDataRepository } from "@/features/master-data/repositories/master-data.repository";
import { resolveActiveOrderPrice } from "@/features/master-data/utils/resolve-active-order-price";
import { getUserBranchIds } from "@/lib/aor/scope";
import { resolvePagination, toPaginatedResult } from "@/lib/shared/pagination";
import { resolveDeliveryDueDate } from "@/features/orders/utils/delivery-schedule";
import { assertOrderingAllowed } from "@/features/orders/utils/order-window";
import { branchRepository } from "@/features/branches/repositories/branch.repository";
import { orderingPolicyService } from "@/features/ordering/services/ordering-policy.service";
import { sendWorkflowEmail } from "@/lib/notifications/workflow-email";

export interface OrderStatusKpi {
  code: string;
  name: string;
  count: number;
}

export interface OrderKpis {
  totalOrders: number;
  statuses: OrderStatusKpi[];
}

export interface OrderApprovalLineAdjustment {
  detailId: string;
  approvedQty: number;
  spRemarks?: string | null;
}

function canPersistSpRemarks(status: BranchOrderStatus, roleSlugs: string[]): boolean {
  return (
    status === "pending_sp" &&
    SUPPLY_PLANNING_APPROVER_SLUGS.some((slug) => roleSlugs.includes(slug))
  );
}

function isWholeApprovedQuantity(qty: number, requested: number): boolean {
  return Number.isInteger(qty) && qty >= 1 && qty <= requested;
}

function parseExpectedUpdatedAt(value: Date | string | null | undefined): Date | undefined {
  if (value == null || value === "") return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(ORDER_CHANGED_MESSAGE);
  }
  return date;
}

/**
 * Every submitted line must belong to the order. Approved quantity is checked
 * only on the final step. SP remarks are rejected outside pending SP.
 */
function indexApprovalLines(
  details: { id: string; quantity: number }[],
  adjustments: OrderApprovalLineAdjustment[],
  opts: { validateApprovedQty: boolean; mayWriteSpRemarks: boolean },
): Map<string, OrderApprovalLineAdjustment> {
  const requestedById = new Map(details.map((detail) => [detail.id, detail.quantity]));
  const byId = new Map<string, OrderApprovalLineAdjustment>();

  for (const line of adjustments) {
    const requested = requestedById.get(line.detailId);
    if (requested == null) {
      throw new Error("One or more lines do not belong to this order.");
    }
    if (line.spRemarks !== undefined && !opts.mayWriteSpRemarks) {
      throw new Error(
        "Only Supply Planning can save line remarks while the order is pending Supply Planning.",
      );
    }
    if (opts.validateApprovedQty && !isWholeApprovedQuantity(line.approvedQty, requested)) {
      throw new Error(
        `Approved quantity must be a whole number from 1 through the requested quantity (${requested}).`,
      );
    }
    byId.set(line.detailId, line);
  }

  return byId;
}

/**
 * A Team Leader's AOR branches, narrowed to the viewer's scope (null = unrestricted).
 * Unlike `getUserBranchIds`, a TL with no AOR yields no branches, never "all".
 */
async function teamLeaderBranchScope(
  tenantId: string,
  teamLeaderId: string,
  viewerBranchIds: string[] | null,
): Promise<string[]> {
  const tlBranchIds = await aorRepository.listExistingBranchIds(tenantId, teamLeaderId);
  if (viewerBranchIds === null) return [...new Set(tlBranchIds)];
  const inScope = new Set(viewerBranchIds);
  return [...new Set(tlBranchIds.filter((id) => inScope.has(id)))];
}

const ORDER_STATUS_ORDER = Object.keys(
  BRANCH_ORDER_STATUS_LABELS,
) as BranchOrderStatus[];

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

const ORDER_LIST_HREF: Record<BranchOrderType, string> = {
  manual: "/orders/manual",
  special: "/orders/special",
  auto_replenish: "/orders/auto-replenish",
};

type OrderBellOrder = {
  id: string;
  orderNumber: string;
  orderType: BranchOrderType;
  createdById: string;
  branch: { name: string };
};

function orderBellTitle(order: Pick<OrderBellOrder, "orderNumber" | "branch">): string {
  return `${order.orderNumber} · ${order.branch.name}`;
}

/** In-app bell for the next person. Skips the actor when they are the only recipient. */
async function notifyOrderStep(input: {
  tenantId: string;
  actorUserId: string;
  order: OrderBellOrder;
  audience: "ROLE" | "USER";
  roleSlug?: string | null;
  body: string;
}) {
  if (input.audience === "USER") {
    if (!input.order.createdById || input.order.createdById === input.actorUserId) {
      return;
    }
  } else if (!input.roleSlug) {
    return;
  }

  await notificationService.createNotification({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    data: {
      audience: input.audience,
      roleSlug: input.audience === "ROLE" ? input.roleSlug : null,
      userId: input.audience === "USER" ? input.order.createdById : null,
      type: "order",
      title: orderBellTitle(input.order),
      body: input.body,
      href: ORDER_LIST_HREF[input.order.orderType],
      metadata: { orderId: input.order.id },
    },
  });
}

function pendingApprovalEmail(status: BranchOrderStatus, orderType: BranchOrderType) {
  if (orderType === "special" && status === "pending_sp") {
    return "Special order submitted — pending Supply Planning approval.";
  }
  if (status === "pending_ps") return "Manual order is still with the product specialist.";
  if (orderType === "manual" && status === "pending_sp") {
    return "Manual order submitted — pending Supply Planning approval.";
  }
  if (status === "pending_tl") return "Order pending Team Leader review.";
  if (status === "pending_sp") return "Order pending Supply Planning approval.";
  return `Order is pending approval (${status}).`;
}

async function priceOrderDetails<T extends { modelId: string; quantity: number }>(
  tenantId: string,
  details: T[],
): Promise<(T & { amount: number })[]> {
  const modelIds = [...new Set(details.map((line) => line.modelId))];
  const sources = await masterDataRepository.listModelsForOrderPricing(tenantId, modelIds);
  const byId = new Map(sources.map((model) => [model.id, model]));
  return details.map((line) => {
    const model = byId.get(line.modelId);
    const srp = model ? resolveActiveOrderPrice(model.priceLists, model.srp) : 0;
    return { ...line, amount: line.quantity * srp };
  });
}

type SapPostRead = { ok: true } | { ok: false; sapMessage: string | null };

function readSapPostResult(
  results: { status: string; sapDocRef?: string; error?: string }[] | null | undefined,
): SapPostRead {
  const result = results?.[0];
  if (result?.status === "completed" && result.sapDocRef) return { ok: true };
  const sapMessage = result?.error?.trim();
  return { ok: false, sapMessage: sapMessage ? sapMessage : null };
}

/** Post this order's existing SAP job. Success is a completed document. */
async function postSupplyPlanningOrder(
  tenantId: string,
  userId: string,
  order: {
    id: string;
    orderNumber: string;
    branchId: string;
    branch: { sapCode: string };
    sapDocType: string | null;
    processedAt: Date | null;
    details: { model: { skuCode: string }; approvedQty: number | null; quantity: number }[];
  },
): Promise<SapPostRead> {
  try {
    await sapService.emitApprovedOrder(tenantId, {
      id: order.id,
      orderNumber: order.orderNumber,
      branchId: order.branchId,
      branchSapCode: order.branch.sapCode,
      docType: order.sapDocType,
      processedAt: order.processedAt,
      lines: order.details.map((d) => ({
        skuCode: d.model.skuCode,
        approvedQty: d.approvedQty,
        quantity: d.quantity,
      })),
    });
    const results = await sapService.processPendingJobs(tenantId, userId, 1, {
      referenceType: SAP_REFERENCE_TYPES.BranchOrder,
      referenceId: order.id,
    });
    return readSapPostResult(results);
  } catch (e) {
    const message = e instanceof Error ? e.message.trim() : "";
    return { ok: false, sapMessage: message || null };
  }
}

export const orderService = {
  async list(
    tenantId: string,
    userId: string,
    hasFullAccess: boolean,
    pagination?: {
      page?: number;
      limit?: number;
      orderType?: BranchOrderType;
      statuses?: BranchOrderStatus[];
      /** One query across types. Replaces orderType + statuses. */
      typeScopes?: OrderTypeScope[];
      /** Only orders from branches in this Team Leader's AOR. */
      teamLeaderId?: string;
    },
    sort?: { field?: OrderListSort; dir?: OrderListSortDir },
  ) {
    const viewerBranchIds = hasFullAccess ? null : await getUserBranchIds(tenantId, userId);
    const branchIds = pagination?.teamLeaderId
      ? await teamLeaderBranchScope(tenantId, pagination.teamLeaderId, viewerBranchIds)
      : viewerBranchIds;
    // The repository reads an empty list as unrestricted, so "no branches" stops here.
    if (branchIds !== null && branchIds.length === 0) {
      const { limit, page } = resolvePagination(pagination);
      return toPaginatedResult([], 0, page, limit);
    }
    return orderRepository.listForTenant(tenantId, branchIds, pagination, sort);
  },

  /** Team Leaders the viewer can filter the order list by. */
  async listTeamLeaderOptions(tenantId: string, userId: string, hasFullAccess: boolean) {
    const viewerBranchIds = hasFullAccess ? null : await getUserBranchIds(tenantId, userId);
    const users = await orderRepository.listTeamLeaderOptions(tenantId, viewerBranchIds);
    return users.map((user) => ({ id: user.id, name: user.name.trim() || user.email }));
  },

  async getKpis(
    tenantId: string,
    userId: string,
    hasFullAccess: boolean,
    orderType?: BranchOrderType,
    statuses?: BranchOrderStatus[],
    typeScopes?: OrderTypeScope[],
  ): Promise<OrderKpis> {
    const statusKeys = typeScopes
      ? manualSpecialQueueStatusKeys(typeScopes, ORDER_STATUS_ORDER)
      : (statuses ?? ORDER_STATUS_ORDER);
    const emptyStatuses = statusKeys.map((status) => ({
      code: status,
      name: BRANCH_ORDER_STATUS_LABELS[status],
      count: 0,
    }));

    const branchIds = hasFullAccess ? null : await getUserBranchIds(tenantId, userId);
    // null = unrestricted; [] = scoped with no branches → empty KPIs.
    if (!hasFullAccess && branchIds !== null && branchIds.length === 0) {
      return { totalOrders: 0, statuses: emptyStatuses };
    }
    if (typeScopes && !hasQueryableTypeScopes(typeScopes)) {
      return { totalOrders: 0, statuses: emptyStatuses };
    }

    const [statusGroups, totalOrders] = await Promise.all([
      typeScopes
        ? orderRepository.countByStatus(tenantId, branchIds, undefined, undefined, typeScopes)
        : orderRepository.countByStatus(tenantId, branchIds, orderType, statuses),
      typeScopes
        ? orderRepository.countAll(tenantId, branchIds, undefined, undefined, typeScopes)
        : orderRepository.countAll(tenantId, branchIds, orderType, statuses),
    ]);

    const countByStatus = new Map(
      statusGroups.map((g) => [g.status, g._count.id]),
    );

    return {
      totalOrders,
      statuses: statusKeys.map((status) => ({
        code: status,
        name: BRANCH_ORDER_STATUS_LABELS[status],
        count: countByStatus.get(status) ?? 0,
      })),
    };
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
      brandId?: string | null;
      /** Mode of payment picked for this order; kept only when it differs from the dealer's. */
      modeOfPaymentId?: string | null;
      details: {
        modelId: string;
        quantity: number;
        remarks?: string | null;
      }[];
      /** When false, branch must be in the user's AOR (same scope as list). */
      hasFullAccess?: boolean;
    },
  ) {
    if (!data.hasFullAccess) {
      // null = unrestricted (no AOR rows); an explicit list must include the branch.
      const branchIds = await getUserBranchIds(tenantId, userId);
      if (branchIds && !branchIds.includes(data.branchId)) {
        throw new Error(
          "You can only create orders for branches in your area of responsibility.",
        );
      }
    }

    const [policy, scheduleCtx] = await Promise.all([
      orderingPolicyService.getPolicy(tenantId),
      branchRepository.findScheduleContext(tenantId, data.branchId),
    ]);
    assertOrderingAllowed({
      action: "create",
      orderType: data.orderType,
      policy,
      branchName: scheduleCtx?.name,
      schedule: scheduleCtx?.deliveryScheduleConfig
        ? { orderDays: scheduleCtx.deliveryScheduleConfig.orderDays }
        : null,
    });

    await validateOrderLines(tenantId, data.branchId, data.orderType, data.details);
    await branchQuotaService.assertWithinQuota(tenantId, data.branchId, data.details);

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

    const details = await priceOrderDetails(
      tenantId,
      data.details.map((line) => ({
        modelId: line.modelId,
        quantity: line.quantity,
        remarks: line.remarks ?? null,
      })),
    );

    let modeOfPaymentOverride: string | null = null;
    if (data.modeOfPaymentId) {
      const choice = await orderRepository.findModeOfPaymentChoice(
        tenantId,
        data.branchId,
        data.modeOfPaymentId,
      );
      if (!choice.modeOfPayment) throw new Error("That mode of payment is not available.");
      if (!choice.modeOfPayment.kind) {
        throw new Error(
          `Mode of payment ${choice.modeOfPayment.name} has no type. Set it to Consignment or Outright in Settings → Master data → Modes of payment.`,
        );
      }
      // Same as the dealer's: store nothing, so the order keeps following the dealer.
      if (choice.modeOfPayment.id !== choice.dealerModeOfPaymentId) {
        modeOfPaymentOverride = choice.modeOfPayment.id;
      }
    }

    const order = await orderRepository.create(tenantId, {
      branchId: data.branchId,
      orderType: data.orderType,
      brandId: data.brandId,
      modeOfPaymentId: modeOfPaymentOverride,
      notes,
      details,
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

  async updateLines(
    tenantId: string,
    userId: string,
    orderId: string,
    opts: {
      hasFullAccess: boolean;
      details: { modelId: string; quantity: number }[];
    },
  ) {
    const order = await orderRepository.findById(tenantId, orderId);
    if (!order) throw new Error("Order not found");
    if (!isOrderEditable(order.status, order.orderType)) {
      throw new Error("This order can no longer be edited.");
    }

    if (!opts.hasFullAccess) {
      // null = unrestricted (no AOR scope); an explicit list must include the branch.
      const branchIds = await getUserBranchIds(tenantId, userId);
      if (branchIds && !branchIds.includes(order.branchId)) {
        throw new Error("You can only edit orders for your own branch.");
      }
    }

    // Editing is only allowed within the branch's ordering window (same day-lock
    // as creating). On a locked day this throws with the lock reason.
    const [policy, scheduleCtx] = await Promise.all([
      orderingPolicyService.getPolicy(tenantId),
      branchRepository.findScheduleContext(tenantId, order.branchId),
    ]);
    assertOrderingAllowed({
      action: "create",
      orderType: order.orderType,
      policy,
      branchName: scheduleCtx?.name,
      schedule: scheduleCtx?.deliveryScheduleConfig
        ? { orderDays: scheduleCtx.deliveryScheduleConfig.orderDays }
        : null,
    });

    await validateOrderLines(tenantId, order.branchId, order.orderType, opts.details);

    const details = await priceOrderDetails(tenantId, opts.details);
    const updated = await orderRepository.updateLines(
      tenantId,
      orderId,
      {
        orderType: order.orderType,
        details,
      },
      {
        syncAllocations: (tx) =>
          suggestionApplyService.allocationEditsForLineChange(tx, {
            tenantId,
            orderId,
            branchId: order.branchId,
            orderType: order.orderType,
            nextLines: opts.details,
          }),
      },
    );

    await auditService.log({
      tenantId,
      userId,
      action: "order.updated",
      entityType: "BranchOrder",
      entityId: orderId,
      metadata: {
        ...orderAuditMetadata(updated),
        from: order.status,
        to: getInitialOrderStatus(order.orderType),
      },
    });

    return updated;
  },

  async submitDraft(
    tenantId: string,
    userId: string,
    orderId: string,
    opts: { hasFullAccess: boolean },
  ) {
    const order = await orderRepository.findById(tenantId, orderId);
    if (!order) throw new Error("Order not found");
    if (order.status !== "draft") {
      throw new Error("Only draft orders can be submitted for review.");
    }
    if (order.details.length === 0) {
      throw new Error("Add at least one line before submitting for review.");
    }

    if (!opts.hasFullAccess) {
      const branchIds = await getUserBranchIds(tenantId, userId);
      if (branchIds && !branchIds.includes(order.branchId)) {
        throw new Error("You can only submit orders for your own branch.");
      }
    }

    const [policy, scheduleCtx] = await Promise.all([
      orderingPolicyService.getPolicy(tenantId),
      branchRepository.findScheduleContext(tenantId, order.branchId),
    ]);
    assertOrderingAllowed({
      action: "create",
      orderType: order.orderType,
      policy,
      branchName: scheduleCtx?.name,
      schedule: scheduleCtx?.deliveryScheduleConfig
        ? { orderDays: scheduleCtx.deliveryScheduleConfig.orderDays }
        : null,
    });

    await validateOrderLines(
      tenantId,
      order.branchId,
      order.orderType,
      order.details.map((detail) => ({ modelId: detail.modelId, quantity: detail.quantity })),
    );

    const nextStatus = getInitialOrderStatus(order.orderType);
    const updated = await orderRepository.submitDraft(tenantId, orderId, order.orderType, {
      beforeStatusChange: (tx) =>
        suggestionApplyService.assertSubmittable(tx, {
          tenantId,
          branchId: order.branchId,
          orderType: order.orderType,
          details: order.details.map((detail) => ({
            id: detail.id,
            modelId: detail.modelId,
            quantity: detail.quantity,
            skuCode: detail.model.skuCode,
          })),
        }),
    });

    await auditService.log({
      tenantId,
      userId,
      action: "order.submitted",
      entityType: "BranchOrder",
      entityId: orderId,
      metadata: {
        ...orderAuditMetadata(updated),
        from: order.status,
        to: nextStatus,
      },
    });

    await sendWorkflowEmail({
      subject: `Branch order ${order.orderNumber} submitted for review`,
      body: pendingApprovalEmail(nextStatus, order.orderType),
    });

    const firstApprover = getOrderApprovalChain(order.orderType)[0]?.roleSlug ?? null;
    await notifyOrderStep({
      tenantId,
      actorUserId: userId,
      order: {
        id: updated.id,
        orderNumber: updated.orderNumber,
        orderType: updated.orderType,
        createdById: updated.createdById,
        branch: { name: updated.branch.name },
      },
      audience: "ROLE",
      roleSlug: firstApprover,
      body: "Submitted for review.",
    });

    return updated;
  },

  async deleteDraft(
    tenantId: string,
    userId: string,
    orderId: string,
    opts: { hasFullAccess: boolean },
  ) {
    const order = await orderRepository.findById(tenantId, orderId);
    if (!order) throw new Error("Order not found");
    if (!canDeleteDraftOrder({ status: order.status })) {
      throw new Error("Only unsubmitted draft orders can be deleted.");
    }

    if (!opts.hasFullAccess) {
      const branchIds = await getUserBranchIds(tenantId, userId);
      if (branchIds && !branchIds.includes(order.branchId)) {
        throw new Error("You can only delete draft orders for your own branch.");
      }
    }

    if (order.processedAt || order.sapDocRef) {
      throw new Error("This draft is linked or processed and cannot be deleted.");
    }

    const auditMetadata = orderAuditMetadata(order);
    const result = await orderRepository.deleteDraft(tenantId, orderId);
    if (result.count === 0) {
      throw new Error(
        "This draft was already submitted for review, removed, or cannot be deleted.",
      );
    }

    await auditService.log({
      tenantId,
      userId,
      action: "order.draft_deleted",
      entityType: "BranchOrder",
      entityId: orderId,
      metadata: {
        ...auditMetadata,
        status: order.status,
      },
    });
  },

  async adminBulkCancelOrDiscard(
    tenantId: string,
    userId: string,
    orderIds: string[],
    opts: { roleSlugs: string[]; permissions: string[] | undefined },
  ) {
    if (!isSuperAdminOrderOverride(opts.roleSlugs)) {
      throw new Error("Only Super Admin can bulk cancel or discard orders.");
    }
    if (!hasOrdersForceCancelPermission(opts.permissions)) {
      throw new Error("An orders permission is required to cancel or discard orders.");
    }

    const uniqueIds = [...new Set(orderIds.filter(Boolean))];
    if (uniqueIds.length === 0) {
      throw new Error("Select at least one order.");
    }

    const orders = await orderRepository.findManyByIds(tenantId, uniqueIds);
    const byId = new Map(orders.map((order) => [order.id, order]));

    let discarded = 0;
    let cancelled = 0;
    const skipped: { id: string; orderNumber: string; reason: string }[] = [];

    const adminCancelComment = "Cancelled by Super Admin";

    for (const id of uniqueIds) {
      const order = byId.get(id);
      if (!order) {
        skipped.push({ id, orderNumber: id, reason: "Order not found" });
        continue;
      }

      const linked = Boolean(
        order.processedAt || order.sapDocRef || order.deliveries.length > 0,
      );
      if (linked) {
        skipped.push({
          id: order.id,
          orderNumber: order.orderNumber,
          reason: "Linked to a delivery or SAP",
        });
        continue;
      }

      if (canDeleteDraftOrder({ status: order.status })) {
        try {
          await this.deleteDraft(tenantId, userId, order.id, { hasFullAccess: true });
          discarded += 1;
        } catch (error) {
          skipped.push({
            id: order.id,
            orderNumber: order.orderNumber,
            reason: error instanceof Error ? error.message : "Could not discard draft",
          });
        }
        continue;
      }

      if (!canAdminForceCancelOrder({ status: order.status })) {
        skipped.push({
          id: order.id,
          orderNumber: order.orderNumber,
          reason: "Already approved, rejected, or cancelled",
        });
        continue;
      }

      const fromStatus = order.status;
      const update = await orderRepository.forceCancelFromPending(
        tenantId,
        order.id,
        fromStatus,
      );
      if (update.count === 0) {
        skipped.push({
          id: order.id,
          orderNumber: order.orderNumber,
          reason: "Already processed or status changed",
        });
        continue;
      }

      const level = getApprovalLevelForStatus(fromStatus, order.orderType);
      const roleSlug = getRoleSlugForApproval(fromStatus, order.orderType);
      await orderRepository.addRejection(order.id, {
        level,
        roleSlug,
        approvedById: userId,
        comment: adminCancelComment,
      });

      await auditService.log({
        tenantId,
        userId,
        action: "order.admin_cancelled",
        entityType: "BranchOrder",
        entityId: order.id,
        metadata: {
          ...orderAuditMetadata(order),
          from: fromStatus,
          to: "cancelled",
          comment: adminCancelComment,
        },
      });

      await notifyOrderStep({
        tenantId,
        actorUserId: userId,
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          orderType: order.orderType,
          createdById: order.createdById,
          branch: { name: order.branch.name },
        },
        audience: "USER",
        body: "Cancelled.",
      });

      cancelled += 1;
    }

    if (discarded === 0 && cancelled === 0) {
      throw new Error(
        skipped.length > 0
          ? "No orders were cancelled or discarded. Check the skipped reasons."
          : "No orders were cancelled or discarded.",
      );
    }

    return { discarded, cancelled, skipped };
  },

  async approve(
    tenantId: string,
    userId: string,
    orderId: string,
    roleSlugs: string[],
    input?: {
      comment?: string;
      lineAdjustments?: OrderApprovalLineAdjustment[];
      deliveryDueDate?: Date;
      expectedUpdatedAt?: Date | string;
      reviewSnapshot?: Prisma.InputJsonValue | null;
    },
  ) {
    const order = await orderRepository.findById(tenantId, orderId);
    if (!order) throw new Error("Order not found");
    if (!canApproveOrder(order.status, order.orderType, roleSlugs)) {
      throw new Error("Not authorized for this approval step");
    }

    const policy = await orderingPolicyService.getPolicy(tenantId);
    assertOrderingAllowed({
      action: "approve",
      orderType: order.orderType,
      policy,
      branchName: order.branch.name,
      schedule: null,
    });

    const roleSlug = getRoleSlugForApproval(order.status, order.orderType);
    const level = getApprovalLevelForStatus(order.status, order.orderType);
    const comment = input?.comment;

    const nextStatus = nextStatusAfterApprove(order.status, order.orderType);
    const isFinal = nextStatus === "approved";
    const adjustmentById = indexApprovalLines(order.details, input?.lineAdjustments ?? [], {
      validateApprovedQty: isFinal,
      mayWriteSpRemarks: canPersistSpRemarks(order.status, roleSlugs),
    });
    const expectedUpdatedAt = parseExpectedUpdatedAt(input?.expectedUpdatedAt);
    if (expectedUpdatedAt && order.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
      throw new Error(ORDER_CHANGED_MESSAGE);
    }

    const deliveryResolution =
      isFinal && input?.deliveryDueDate
        ? resolveDeliveryDueDate(
            input.deliveryDueDate.toISOString().slice(0, 10),
            order.branch.deliverySchedule,
          )
        : { dueDate: null as Date | null, rescheduled: false, rescheduledFrom: undefined as string | undefined };

    if (isFinal) {
      // Decide ITR or SO and block before anything is written, so the order stays at its step.
      const routingContext = await orderRepository.findSapRoutingContext(
        tenantId,
        order.branchId,
        order.id,
      );
      if (!routingContext.branch) throw new Error("Branch not found");
      const routing = resolveOrderSapRouting({
        branch: routingContext.branch,
        mainWarehouse: routingContext.mainWarehouse,
        dealer: routingContext.branch.dealer,
        orderModeOfPayment: routingContext.orderModeOfPayment,
      });
      if (!routing.ok) throw new Error(routing.error);

      const lines = order.details.map((line) => {
        const adjustment = adjustmentById.get(line.id);
        return {
          detailId: line.id,
          approvedQty: adjustment?.approvedQty ?? line.quantity,
          ...(adjustment && adjustment.spRemarks !== undefined
            ? { spRemarks: adjustment.spRemarks }
            : {}),
        };
      });

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
        fromStatus: order.status,
        expectedUpdatedAt,
        level,
        approvedById: userId,
        comment,
        spaRemarks: comment,
        deliveryDueDate: deliveryResolution.dueDate ?? undefined,
        brandId,
        sapDocType: routing.docType,
        reviewSnapshot: input?.reviewSnapshot,
        lines,
      });

      const refreshed = await orderRepository.findById(tenantId, orderId);
      if (isSupplyPlanningApprovalStep(order.status, order.orderType)) {
        const post = refreshed
          ? await postSupplyPlanningOrder(tenantId, userId, refreshed)
          : { ok: false as const, sapMessage: null };
        if (!post.ok) {
          let updatedAt: Date | null = null;
          try {
            const reverted = await orderRepository.revertSupplyPlanningApproval(
              tenantId,
              orderId,
              level,
            );
            updatedAt = reverted.updatedAt;
          } catch (rollbackError) {
            await auditService.log({
              tenantId,
              userId,
              action: "order.sap_emit_failed",
              entityType: "BranchOrder",
              entityId: orderId,
              metadata: {
                error: post.sapMessage ?? "SAP did not complete",
                rollback:
                  rollbackError instanceof Error ? rollbackError.message : "unknown",
              },
            });
            throw new Error(
              "SAP did not accept this order, and it could not be returned to Pending Supply Planning. Refresh and check the order before approving again.",
            );
          }
          await auditService.log({
            tenantId,
            userId,
            action: "order.sap_emit_failed",
            entityType: "BranchOrder",
            entityId: orderId,
            metadata: { error: post.sapMessage ?? "SAP did not complete" },
          });
          throw new SapOrderPostRejectedError(post.sapMessage, updatedAt);
        }
      } else if (refreshed) {
        // Older logistics final steps still post SAP without blocking the step.
        try {
          await sapService.emitApprovedOrder(tenantId, {
            id: refreshed.id,
            orderNumber: refreshed.orderNumber,
            branchId: refreshed.branchId,
            branchSapCode: refreshed.branch.sapCode,
            docType: refreshed.sapDocType,
            processedAt: refreshed.processedAt,
            lines: refreshed.details.map((d) => ({
              skuCode: d.model.skuCode,
              approvedQty: d.approvedQty,
              quantity: d.quantity,
            })),
          });
          await sapService.processPendingJobs(tenantId, userId, 1, {
            referenceType: SAP_REFERENCE_TYPES.BranchOrder,
            referenceId: orderId,
          });
        } catch (e) {
          await auditService.log({
            tenantId,
            userId,
            action: "order.sap_emit_failed",
            entityType: "BranchOrder",
            entityId: orderId,
            metadata: { error: e instanceof Error ? e.message : "unknown" },
          });
        }
      }
    } else {
      await orderRepository.addApproval(orderId, {
        level,
        roleSlug,
        approvedById: userId,
        comment,
      });
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

    const bellOrder = {
      id: order.id,
      orderNumber: order.orderNumber,
      orderType: order.orderType,
      createdById: order.createdById,
      branch: { name: order.branch.name },
    };
    if (isFinal) {
      await notifyOrderStep({
        tenantId,
        actorUserId: userId,
        order: bellOrder,
        audience: "USER",
        body: "Approved.",
      });
    } else if (order.orderType === "auto_replenish" && order.status === "pending_tl") {
      await notifyOrderStep({
        tenantId,
        actorUserId: userId,
        order: bellOrder,
        audience: "ROLE",
        roleSlug: "sp",
        body: "Approved by the team leader. Waiting for supply planning.",
      });
    }
  },

  async reject(
    tenantId: string,
    userId: string,
    orderId: string,
    roleSlugs: string[],
    comment?: string,
  ) {
    const order = await orderRepository.findById(tenantId, orderId);
    if (!order) throw new Error("Order not found");
    if (!canApproveOrder(order.status, order.orderType, roleSlugs)) {
      throw new Error("Not authorized to reject at this approval step");
    }

    const level = getApprovalLevelForStatus(order.status, order.orderType);
    const roleSlug = getRoleSlugForApproval(order.status, order.orderType);
    const nextStatus = declineOrderStatus(order.status, order.orderType);

    await orderRepository.updateStatus(tenantId, orderId, nextStatus);
    await orderRepository.addRejection(orderId, {
      level,
      roleSlug,
      approvedById: userId,
      comment,
    });

    await auditService.log({
      tenantId,
      userId,
      action: nextStatus === "cancelled" ? "order.cancelled" : "order.rejected",
      entityType: "BranchOrder",
      entityId: orderId,
      metadata: {
        ...orderAuditMetadata(order),
        from: order.status,
        to: nextStatus,
        ...(comment ? { comment } : {}),
      },
    });

    await notifyOrderStep({
      tenantId,
      actorUserId: userId,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        orderType: order.orderType,
        createdById: order.createdById,
        branch: { name: order.branch.name },
      },
      audience: "USER",
      body: nextStatus === "cancelled" ? "Cancelled." : "Rejected.",
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

  /** Sidebar: orders at approval steps this user can act on (AOR-scoped when not full access). */
  async countActionableQueue(
    tenantId: string,
    userId: string,
    hasFullAccess: boolean,
    orderType: BranchOrderType,
    statuses: BranchOrderStatus[],
  ): Promise<number> {
    if (statuses.length === 0) return 0;
    const branchIds = hasFullAccess ? null : await getUserBranchIds(tenantId, userId);
    if (!hasFullAccess && branchIds !== null && branchIds.length === 0) {
      return 0;
    }
    return orderRepository.countAll(tenantId, branchIds, orderType, statuses);
  },
};
