import { auditService } from "@/features/audit/services/audit.service";
import { orderRepository } from "@/features/orders/repositories/order.repository";
import { resolveOrderSapRouting } from "@/features/orders/services/order-sap-routing";
import { logisticsService } from "@/features/logistics/services/logistics.service";
import type { SapOutboundPort } from "@/features/sap/ports/sap-outbound.port";
import { SAP_REFERENCE_TYPES } from "@/features/sap/constants/sap-job-types";
import { sapIntegrationRepository } from "@/features/sap/repositories/sap-integration.repository";
import {
  buildItrBody,
  buildSoBody,
  postSapDocument,
} from "@/features/sap/services/sap-documents";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";
import { mockSapOutbound } from "@/features/sap/adapters/mock-sap-outbound";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import { prisma } from "@/lib/database/client";

const NOT_IMPLEMENTED = "Not implemented yet";
/** YYYY-MM-DD, as SAP expects for DocDueDate. */
function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/**
 * Live B1 create adapter. Only the approved-order document is live in this slice;
 * the other create methods are filled in by the dispatch, transfer and return tasks.
 * Inventory Posting (P-Count) stays on the separate live path in sap.service.
 */
export const serviceLayerSapOutbound: SapOutboundPort = {
  async createApprovedOrderDocument({ tenantId, userId, job }) {
    const orderId = job.referenceId;
    if (!orderId) throw new Error("Missing order reference");

    const creds = await sapServiceLayerService.getCredentials(tenantId);
    if (!creds) throw new Error("SAP Service Layer is not configured");

    const order = await prisma.branchOrder.findFirst({
      where: { id: orderId, tenantId },
      include: {
        branch: { select: { name: true } },
        details: {
          orderBy: { id: "asc" },
          include: { model: { select: { skuCode: true } } },
        },
      },
    });
    if (!order) throw new Error("Order not found");

    const ctx = await orderRepository.findSapRoutingContext(tenantId, order.branchId);
    if (!ctx.branch) throw new Error("Branch not found");
    const routing = resolveOrderSapRouting({
      branch: ctx.branch,
      mainWarehouse: ctx.mainWarehouse,
      dealer: ctx.branch.dealer,
    });
    if (!routing.ok) throw new Error(routing.error);

    // Orders approved before routing existed have no stored type: take the resolved one.
    const docType = order.sapDocType ?? routing.docType;

    const lines = order.details
      .map((d) => ({ id: d.id, itemCode: d.model.skuCode, quantity: d.approvedQty ?? d.quantity }))
      .filter((l) => l.quantity > 0);
    if (lines.length === 0) throw new Error("Order has no lines with an approved quantity");

    const plainLines = lines.map(({ itemCode, quantity }) => ({ itemCode, quantity }));
    let body: Record<string, unknown>;
    if (docType === "SO") {
      if (!routing.cardCode) throw new Error("Dealer has no SAP customer code");
      body = buildSoBody({
        ismsRef: order.orderNumber,
        cardCode: routing.cardCode,
        whs: routing.sourceWhsCode,
        dueDate: isoDate(order.deliveryDueDate ?? new Date()),
        lines: plainLines,
      });
    } else {
      body = buildItrBody({
        ismsRef: order.orderNumber,
        fromWhs: routing.sourceWhsCode,
        toWhs: routing.branchWhsCode,
        lines: plainLines,
      });
    }

    const ref = await postSapDocument(creds, docType, order.orderNumber, body);
    if (ref.lineNums.length !== lines.length) {
      throw new Error(`SAP returned ${ref.lineNums.length} lines for ${lines.length} order lines`);
    }
    const sapDocRef = `${docType}-${ref.docNum}`;

    // Resolved before the transaction so its body only uses `tx`.
    const statusCodeId = await reasonStatusService.requireCodeId(
      tenantId,
      "delivery_workflow",
      "approved",
    );
    let createdDelivery = false;

    const delivery = await prisma.$transaction(async (tx) => {
      await tx.branchOrder.update({
        where: { id: orderId },
        data: {
          sapDocType: docType,
          sapDocEntry: ref.docEntry,
          sapDocNum: ref.docNum,
          sapDocRef,
        },
      });

      for (const [i, line] of lines.entries()) {
        await tx.branchOrderDetail.update({
          where: { id: line.id },
          data: { sapLineNum: ref.lineNums[i] },
        });
      }

      const existing = await tx.branchDelivery.findFirst({ where: { tenantId, orderId } });
      if (existing) {
        if (!existing.sourceWarehouseId) {
          return tx.branchDelivery.update({
            where: { id: existing.id },
            data: { sourceWarehouseId: routing.sourceWarehouseId },
          });
        }
        return existing;
      }
      if (!userId) return null;
      createdDelivery = true;
      return logisticsService.createDeliveryFromApprovedOrder(
        tenantId,
        userId,
        {
          id: order.id,
          branchId: order.branchId,
          branchName: order.branch.name,
          orderNumber: order.orderNumber,
        },
        { sourceWarehouseId: routing.sourceWarehouseId, tx, statusCodeId },
      );
    });

    await sapIntegrationRepository.markCompleted(job.id, sapDocRef);

    if (createdDelivery && delivery && userId) {
      await auditService.log({
        tenantId,
        userId,
        action: "delivery.created_from_order",
        entityType: "BranchDelivery",
        entityId: delivery.id,
        metadata: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          deliveryNo: delivery.deliveryNo,
          branchName: order.branch.name,
        },
      });
    }

    await auditService.log({
      tenantId,
      userId,
      action: "sap.order_processed",
      entityType: SAP_REFERENCE_TYPES.BranchOrder,
      entityId: orderId,
      metadata: {
        sapDocRef,
        docType,
        sapDocEntry: ref.docEntry,
        deliveryId: delivery?.id,
        adapter: "service_layer",
      },
    });

    return sapDocRef;
  },

  // Live pull-out and legacy partial-return documents are out of this plan's scope: use the mock.
  createPulloutItr: (args) => mockSapOutbound.createPulloutItr(args),

  createPartialDeliveryInventoryTransfer: (args) =>
    mockSapOutbound.createPartialDeliveryInventoryTransfer(args),

  async createDispatchDocument() {
    throw new Error(NOT_IMPLEMENTED);
  },

  async createDeliveryReturnDocument() {
    throw new Error(NOT_IMPLEMENTED);
  },

  async createDeliveryTransferDocument() {
    throw new Error(NOT_IMPLEMENTED);
  },
};
