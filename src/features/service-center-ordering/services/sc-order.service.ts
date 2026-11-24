import type { BranchOrderStatus } from "@prisma/client";

import { auditService } from "@/features/audit/services/audit.service";
import { closeOrderSapDocument } from "@/features/orders/services/order-sap-close";
import { SAP_REFERENCE_TYPES } from "@/features/sap/constants/sap-job-types";
import { readSapPostResult } from "@/features/sap/services/sap-post-result";
import { sapService } from "@/features/sap/services/sap.service";
import {
  assertWithinWarehouseStock,
  loadScOrderWorksheet,
} from "@/features/service-center-ordering/services/sc-order-worksheet";
import { isSapProject } from "@/features/service-center-ordering/services/sc-ordering-sap";
import { scOrderingSettingsService } from "@/features/service-center-ordering/services/sc-ordering-settings.service";
import { SC_ORDER_APPROVABLE_STATUSES } from "@/features/service-center-ordering/constants";
import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma/client";

const APPROVABLE: BranchOrderStatus[] = [...SC_ORDER_APPROVABLE_STATUSES];

/** One line per model, quantities summed, so a repeated model can't dodge the stock check. */
function mergeLines(lines: { modelId: string; quantity: number }[]) {
  const byModel = new Map<string, number>();
  for (const line of lines) byModel.set(line.modelId, (byModel.get(line.modelId) ?? 0) + line.quantity);
  return [...byModel].map(([modelId, quantity]) => ({ modelId, quantity }));
}

function nextOrderNo() {
  return `SCO-${Date.now().toString(36).toUpperCase()}`;
}

export interface CreateScOrderInput {
  serviceCenterId: string;
  serviceCenterLocationId?: string | null;
  /** A listed ordering customer; null bills the primary one. */
  cardCode?: string | null;
  poNumber?: string | null;
  projectCode?: string | null;
  notes?: string | null;
  lines: { modelId: string; quantity: number }[];
  /** `special` for a unit ordered for one customer (a Service Replacement). Default `manual`. */
  orderType?: "manual" | "special";
}

export const scOrderService = {
  /**
   * Creates the order with what its SO will post: the customer, the Settings defaults,
   * the PO number and a SAP project checked against SAP now, not at approval.
   */
  async create(tenantId: string, userId: string, input: CreateScOrderInput) {
    const modelIds = [...new Set(input.lines.map((line) => line.modelId))];
    const [models, center, snapshot] = await Promise.all([
      prisma.productModel.findMany({
        where: { id: { in: modelIds }, tenantId },
        select: { id: true },
      }),
      prisma.serviceCenter.findFirst({
        where: { id: input.serviceCenterId, tenantId, deletedAt: null, status: "active" },
        select: { id: true },
      }),
      scOrderingSettingsService.resolvePostingSnapshot(tenantId, input.cardCode ?? null),
    ]);
    if (!center) throw new Error("Service center not found");
    if (models.length !== modelIds.length) throw new Error("One or more models not found");

    // Re-read SAP: stock may have moved since the form loaded.
    const merged = mergeLines(input.lines);
    assertWithinWarehouseStock(
      await loadScOrderWorksheet(tenantId, snapshot.sapWarehouseCode),
      merged,
    );

    const projectCode = input.projectCode?.trim() || null;
    if (projectCode && !(await isSapProject(tenantId, projectCode))) {
      throw new Error(`SAP has no active project ${projectCode}.`);
    }

    const orderNumber = nextOrderNo();
    const order = await prisma.serviceCenterOrder.create({
      data: {
        tenantId,
        serviceCenterId: input.serviceCenterId,
        serviceCenterLocationId: input.serviceCenterLocationId ?? null,
        orderType: input.orderType ?? "manual",
        status: "pending_sp",
        orderNumber,
        notes: input.notes?.trim() || null,
        poNumber: input.poNumber?.trim() || null,
        projectCode,
        ...snapshot,
        createdById: userId,
        details: {
          create: merged.map((line) => ({
            modelId: line.modelId,
            quantity: line.quantity,
            approvedQty: line.quantity,
          })),
        },
        approvalLevels: { create: [{ level: 1, roleSlug: "sp" }] },
      },
      select: { id: true, orderNumber: true },
    });

    await auditService.log({
      tenantId,
      userId,
      action: "sc_order.created",
      entityType: "ServiceCenterOrder",
      entityId: order.id,
      metadata: {
        orderNumber,
        orderType: input.orderType ?? "manual",
        cardCode: snapshot.sapCardCode,
        poNumber: input.poNumber ?? null,
      },
    });
    return order;
  },

  /**
   * Approves and posts the SO in the same request. When SAP refuses, the approval is
   * undone so the order stays pending with SAP's reason, the same as branch orders.
   */
  async approve(tenantId: string, userId: string, order: { id: string; orderNumber: string; status: BranchOrderStatus }) {
    const now = new Date();
    const approved = await prisma.$transaction(async (tx) => {
      // Guarded on status so a double click can't approve (and post) twice.
      const updated = await tx.serviceCenterOrder.updateMany({
        where: { id: order.id, tenantId, status: { in: APPROVABLE } },
        data: { status: "approved" },
      });
      if (updated.count !== 1) return false;
      await tx.serviceCenterOrderApprovalLevel.updateMany({
        where: { orderId: order.id, approvedAt: null, rejectedAt: null },
        data: { approvedAt: now, approvedById: userId },
      });
      return true;
    });
    if (!approved) throw new Error("Order is not pending approval");

    let post;
    try {
      await sapService.emitServiceCenterOrder(tenantId, order);
      post = readSapPostResult(
        await sapService.processPendingJobs(tenantId, userId, 1, {
          referenceType: SAP_REFERENCE_TYPES.ServiceCenterOrder,
          referenceId: order.id,
        }),
      );
    } catch (e) {
      post = { ok: false as const, sapMessage: e instanceof Error ? e.message.trim() || null : null };
    }

    if (!post.ok) {
      await prisma.$transaction([
        prisma.serviceCenterOrder.updateMany({
          where: { id: order.id, tenantId, status: "approved", sapDocRef: null },
          data: { status: order.status },
        }),
        prisma.serviceCenterOrderApprovalLevel.updateMany({
          where: { orderId: order.id, approvedAt: now, approvedById: userId },
          data: { approvedAt: null, approvedById: null },
        }),
      ]);
      await auditService.log({
        tenantId,
        userId,
        action: "sc_order.sap_rejected",
        entityType: "ServiceCenterOrder",
        entityId: order.id,
        metadata: { orderNumber: order.orderNumber, error: post.sapMessage ?? "SAP did not complete" },
      });
      throw new Error(
        `SAP did not accept the Sales Order, so the order is still pending. ${post.sapMessage ?? ""}`.trim(),
      );
    }

    await auditService.log({
      tenantId,
      userId,
      action: "sc_order.approved",
      entityType: "ServiceCenterOrder",
      entityId: order.id,
      metadata: { orderNumber: order.orderNumber },
    });
  },

  /**
   * Supply Planning cancels an approved order: SAP's SO is closed first (refused once a DR
   * was copied from it), then the order becomes Cancelled. `onCancelled` runs in the same
   * transaction (the caller puts a special order's Service Replacement back, as on Reject).
   * Retrying is safe: SAP then reports the SO as closed and only ISMS is written.
   */
  async cancelApproved<T>(
    tenantId: string,
    userId: string,
    orderId: string,
    onCancelled: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<{ orderNumber: string; sapSoNum: number; after: T }> {
    const order = await prisma.serviceCenterOrder.findFirst({
      where: { id: orderId, tenantId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        sapDocEntry: true,
        sapClosedAt: true,
        _count: { select: { deliveries: true } },
      },
    });
    if (!order) throw new Error("Order not found");
    if (order.status !== "approved" || order.sapDocEntry == null) {
      throw new Error("Only an approved order with a SAP Sales Order can be cancelled.");
    }
    if (order._count.deliveries > 0 || order.sapClosedAt) {
      throw new Error("A DR from this order's SO is already in ISMS, so the order cannot be cancelled.");
    }

    const sap = await closeOrderSapDocument(tenantId, {
      type: "SO",
      docEntry: order.sapDocEntry,
      orderNumber: order.orderNumber,
    });
    let after: T;
    try {
      after = await prisma.$transaction(async (tx) => {
        const cancelled = await tx.serviceCenterOrder.updateMany({
          where: { id: order.id, tenantId, status: "approved", sapClosedAt: null },
          data: { status: "cancelled" },
        });
        if (cancelled.count !== 1) throw new Error("This order changed. Reload and try again.");
        // A DR applied between the check above and now would leave units with no order.
        const delivered = await tx.serviceCenterDelivery.count({ where: { tenantId, orderId: order.id } });
        if (delivered > 0) throw new Error("A DR from this order's SO just arrived in ISMS.");
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "sc_order.cancelled_after_approval",
            entityType: "ServiceCenterOrder",
            entityId: order.id,
            metadata: { orderNumber: order.orderNumber, sapSoNum: sap.docNum, sapClosedNow: sap.closedNow },
          },
        });
        return onCancelled(tx);
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown error";
      throw new Error(`SO ${sap.docNum} is closed in SAP, but the order could not be cancelled in ISMS (${reason}). Try again.`);
    }
    return { orderNumber: order.orderNumber, sapSoNum: sap.docNum, after };
  },
};
