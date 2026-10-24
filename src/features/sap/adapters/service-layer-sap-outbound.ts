import { auditService } from "@/features/audit/services/audit.service";
import { orderRepository } from "@/features/orders/repositories/order.repository";
import {
  docTypeForOrder,
  resolveOrderSapRouting,
  resolveStoredOrderSapPlaces,
  type OrderSapPlaces,
} from "@/features/orders/services/order-sap-routing";
import type { OrderSapDocType } from "@/features/orders/constants/order-sap-doc-type";
import { logisticsService } from "@/features/logistics/services/logistics.service";
import type { SapOutboundPort } from "@/features/sap/ports/sap-outbound.port";
import { SAP_REFERENCE_TYPES } from "@/features/sap/constants/sap-job-types";
import { sapIntegrationRepository } from "@/features/sap/repositories/sap-integration.repository";
import {
  buildDrBody,
  buildItBody,
  buildItrBody,
  buildReturnBody,
  buildSoBody,
  postSapDocument,
  type SapSerialLine,
} from "@/features/sap/services/sap-documents";
import {
  completeDeliveryReturn,
  type DeliveryReturnSapKind,
} from "@/features/logistics/services/delivery-return-completion";
import { sapErrorMessage } from "@/features/sap/services/sap-master-data";
import { sapServiceLayerClient } from "@/features/sap/services/sap-service-layer-client";
import type { SapServiceLayerCredentials } from "@/features/sap/types/sap-service-layer";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";
import { mockSapOutbound } from "@/features/sap/adapters/mock-sap-outbound";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import { prisma } from "@/lib/database/client";
import type { SapIntegrationJob } from "@prisma/client";

/** YYYY-MM-DD, as SAP expects for DocDueDate. */
function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

const LEGACY_ORDER_MESSAGE =
  "This order was approved before SAP posting was enabled. Re-approve or post it in SAP.";

interface DispatchDetail {
  modelId: string;
  skuCode: string;
  capacity: number;
  sapLineNum: number | null;
}

/**
 * Splits the dispatched serials across the order lines: grouped by model, then
 * filled into that model's lines in order up to each line's approved quantity.
 */
function mapSerialsToLines(
  details: DispatchDetail[],
  serials: { serialNo: string; modelId: string; skuCode: string }[],
  baseEntry: number,
): SapSerialLine[] {
  const remaining = new Map<string, string[]>();
  for (const s of serials) {
    remaining.set(s.modelId, [...(remaining.get(s.modelId) ?? []), s.serialNo]);
  }

  const lines: SapSerialLine[] = [];
  for (const detail of details) {
    const pool = remaining.get(detail.modelId);
    if (!pool || pool.length === 0 || detail.capacity <= 0) continue;
    if (detail.sapLineNum == null) {
      throw new Error(`Order line for ${detail.skuCode} has no SAP line number`);
    }
    lines.push({
      itemCode: detail.skuCode,
      serialNos: pool.splice(0, detail.capacity),
      baseEntry,
      baseLine: detail.sapLineNum,
    });
  }

  const unmapped = [...remaining.values()].reduce((sum, pool) => sum + pool.length, 0);
  if (unmapped > 0) throw new Error("Some serials do not match an approved order line");
  return lines;
}

/** Serials grouped by item, sorted, without a base document. */
function groupSerialsBySku(rows: { serialNo: string; skuCode: string }[]): SapSerialLine[] {
  const bySku = new Map<string, string[]>();
  for (const row of rows) {
    bySku.set(row.skuCode, [...(bySku.get(row.skuCode) ?? []), row.serialNo]);
  }
  return [...bySku.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([itemCode, serialNos]) => ({ itemCode, serialNos }));
}

interface SapDrLine {
  LineNum: number;
  ItemCode?: string;
  SerialNumbers?: { InternalSerialNumber?: string | null }[];
}

/**
 * Return lines copied from the DR in SAP: each returned serial is matched to
 * the DR line that carries it, so the Return references the right BaseLine.
 */
async function mapReturnLinesFromDr(
  creds: SapServiceLayerCredentials,
  drEntry: number,
  drNo: string,
  serials: { serialNo: string; skuCode: string }[],
): Promise<SapSerialLine[]> {
  const read = await sapServiceLayerClient.request<{ DocumentLines?: SapDrLine[] }>({
    creds,
    method: "GET",
    path: `/DeliveryNotes(${drEntry})?$select=DocEntry,DocumentLines`,
  });
  if (read.statusCode >= 400) {
    throw new Error(sapErrorMessage(read.statusCode, read.rawBody, "DeliveryNotes"));
  }

  const lineBySerial = new Map<string, SapDrLine>();
  for (const line of read.data?.DocumentLines ?? []) {
    for (const serial of line.SerialNumbers ?? []) {
      const no = serial.InternalSerialNumber?.trim();
      if (no) lineBySerial.set(no, line);
    }
  }

  const byLine = new Map<number, SapSerialLine>();
  for (const serial of serials) {
    const drLine = lineBySerial.get(serial.serialNo);
    if (!drLine) throw new Error(`Serial ${serial.serialNo} is not on DR# ${drNo} in SAP`);
    const entry = byLine.get(drLine.LineNum) ?? {
      itemCode: drLine.ItemCode || serial.skuCode,
      serialNos: [],
      baseEntry: drEntry,
      baseLine: drLine.LineNum,
    };
    entry.serialNos.push(serial.serialNo);
    byLine.set(drLine.LineNum, entry);
  }
  return [...byLine.values()].sort((a, b) => (a.baseLine ?? 0) - (b.baseLine ?? 0));
}

/** Consignment returns post an Inventory Transfer; outright ones a Return on the DR. */
function returnKind(docType: "ITR" | "SO"): DeliveryReturnSapKind {
  return docType === "SO" ? "RETURN" : "IT";
}

/** Approved return: IT branch → source warehouse (consignment) or Return on the DR (outright). */
async function postDeliveryReturn(
  tenantId: string,
  userId: string | undefined,
  job: SapIntegrationJob,
  returnId: string,
): Promise<string> {
  const creds = await sapServiceLayerService.getCredentials(tenantId);
  if (!creds) throw new Error("SAP Service Layer is not configured");

  const request = await prisma.deliveryReturnRequest.findFirst({
    where: { id: returnId, tenantId },
    select: {
      requestNo: true,
      status: true,
      sapDocNo: true,
      lines: {
        select: { serialNumber: { select: { serialNo: true, model: { select: { skuCode: true } } } } },
        orderBy: { serialNumber: { serialNo: "asc" } },
      },
      delivery: {
        select: {
          sapDocEntry: true,
          drNo: true,
          sourceWarehouse: { select: { code: true } },
          branch: { select: { sapCode: true, dealer: { select: { sapCode: true } } } },
          order: { select: { sapDocType: true } },
        },
      },
    },
  });
  if (!request) throw new Error("Return request not found");
  if (request.status === "COMPLETED" && request.sapDocNo) {
    // Finished on an earlier attempt that stopped before the job was marked.
    const kind = returnKind(docTypeForOrder({ sapDocType: request.delivery.order?.sapDocType ?? null }));
    const done = `${kind}-${request.sapDocNo}`;
    await sapIntegrationRepository.markCompleted(job.id, done);
    return done;
  }
  if (request.status !== "APPROVED") throw new Error("Only an approved return can be posted to SAP");
  if (request.lines.length === 0) throw new Error("This return has no units");

  const delivery = request.delivery;
  const toWhs = delivery.sourceWarehouse?.code;
  if (!toWhs) throw new Error("Delivery has no source warehouse");
  const docType = docTypeForOrder({ sapDocType: delivery.order?.sapDocType ?? null });
  const serials = request.lines.map((line) => ({
    serialNo: line.serialNumber.serialNo,
    skuCode: line.serialNumber.model.skuCode,
  }));

  const kind = returnKind(docType);
  let body: Record<string, unknown>;
  if (docType === "SO") {
    if (delivery.sapDocEntry == null) throw new Error("Delivery has no DR in SAP");
    const cardCode = delivery.branch.dealer?.sapCode;
    if (!cardCode) throw new Error("Dealer has no SAP customer code");
    const drNo = delivery.drNo ?? String(delivery.sapDocEntry);
    body = buildReturnBody({
      ismsRef: request.requestNo,
      cardCode,
      whs: toWhs,
      baseDrEntry: delivery.sapDocEntry,
      lines: await mapReturnLinesFromDr(creds, delivery.sapDocEntry, drNo, serials),
    });
  } else {
    if (!delivery.branch.sapCode) throw new Error("Branch has no SAP warehouse code");
    body = buildItBody({
      ismsRef: request.requestNo,
      fromWhs: delivery.branch.sapCode,
      toWhs,
      lines: groupSerialsBySku(serials),
    });
  }

  const ref = await postSapDocument(creds, kind, request.requestNo, body);
  await prisma.deliveryReturnRequest.update({
    where: { id: returnId },
    data: {
      sapDocEntry: ref.docEntry,
      sapDocNo: ref.displayNo,
      sapDocDate: ref.docDate ? new Date(ref.docDate) : null,
      sapError: null,
    },
  });
  try {
    await completeDeliveryReturn({ tenantId, userId, returnId, kind, sapDocNo: ref.displayNo });
  } catch (error) {
    // SAP has the document; only the local move failed. Say so, so nobody re-posts it by hand.
    const message = error instanceof Error ? error.message : "unknown error";
    throw new Error(`SAP posted ${kind} ${ref.displayNo}; moving units failed: ${message}`);
  }

  const sapDocRef = `${kind}-${ref.displayNo}`;
  await sapIntegrationRepository.markCompleted(job.id, sapDocRef);
  await auditService.log({
    tenantId,
    userId,
    action: "sap.delivery_return_processed",
    entityType: SAP_REFERENCE_TYPES.DeliveryReturnRequest,
    entityId: returnId,
    metadata: { sapDocRef, sapDocEntry: ref.docEntry, adapter: "service_layer" },
  });
  return sapDocRef;
}

/** Released units of a unit transfer: their serials grouped by item, without a base document. */
async function postDeliveryTransfer(
  tenantId: string,
  userId: string | undefined,
  job: SapIntegrationJob,
  transferId: string,
): Promise<string> {
  const creds = await sapServiceLayerService.getCredentials(tenantId);
  if (!creds) throw new Error("SAP Service Layer is not configured");

  const transfer = await prisma.deliveryTransfer.findFirst({
    where: { id: transferId, tenantId },
    select: {
      transferNo: true,
      status: true,
      sapDocEntry: true,
      sapDocNo: true,
      releaseBranch: { select: { sapCode: true } },
      releaseWarehouse: { select: { code: true } },
      receiveBranch: { select: { sapCode: true } },
      receiveWarehouse: { select: { code: true } },
      lines: {
        // RECEIVED lines were released too: a retry after a receipt still posts them.
        where: { status: { in: ["APPROVED", "RECEIVED"] } },
        select: { serialNumber: { select: { serialNo: true } }, model: { select: { skuCode: true } } },
        orderBy: { serialNumber: { serialNo: "asc" } },
      },
    },
  });
  if (!transfer) throw new Error("Unit transfer not found");
  if (transfer.sapDocEntry != null && transfer.sapDocNo) {
    // Posted on an earlier attempt that stopped before the job was marked.
    const done = `IT-${transfer.sapDocNo}`;
    await sapIntegrationRepository.markCompleted(job.id, done);
    return done;
  }
  // A cancelled (or not yet released) transfer must never reach SAP.
  if (transfer.status !== "IN_TRANSIT") throw new Error("Only a unit transfer in transit can be posted to SAP");

  const fromWhs = transfer.releaseBranch?.sapCode || transfer.releaseWarehouse?.code;
  const toWhs = transfer.receiveBranch?.sapCode || transfer.receiveWarehouse?.code;
  if (!fromWhs) throw new Error("Branch release has no SAP warehouse code");
  if (!toWhs) throw new Error("Branch receive has no SAP warehouse code");
  if (transfer.lines.length === 0) throw new Error("Unit transfer has no released units");

  const lines = groupSerialsBySku(
    transfer.lines.map((line) => ({ serialNo: line.serialNumber.serialNo, skuCode: line.model.skuCode })),
  );

  const ref = await postSapDocument(
    creds,
    "IT",
    transfer.transferNo,
    buildItBody({ ismsRef: transfer.transferNo, fromWhs, toWhs, lines }),
  );
  await prisma.deliveryTransfer.update({
    where: { id: transferId },
    data: {
      sapDocEntry: ref.docEntry,
      sapDocNo: ref.displayNo,
      sapDocDate: ref.docDate ? new Date(ref.docDate) : null,
      sapError: null,
    },
  });

  const sapDocRef = `IT-${ref.displayNo}`;
  await sapIntegrationRepository.markCompleted(job.id, sapDocRef);
  await auditService.log({
    tenantId,
    userId,
    action: "sap.delivery_transfer_processed",
    entityType: SAP_REFERENCE_TYPES.DeliveryTransfer,
    entityId: transferId,
    metadata: { sapDocRef, sapDocEntry: ref.docEntry, adapter: "service_layer" },
  });
  return sapDocRef;
}

/**
 * Live B1 create adapter: approved order (ITR or SO), dispatch (IT or DR), unit
 * transfer (IT) and delivery return (IT or Return). Pull-out stays on the mock.
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

    const ctx = await orderRepository.findSapRoutingContext(tenantId, order.branchId, order.id);
    if (!ctx.branch) throw new Error("Branch not found");
    const routingInput = {
      branch: ctx.branch,
      mainWarehouse: ctx.mainWarehouse,
      dealer: ctx.branch.dealer,
      orderModeOfPayment: ctx.orderModeOfPayment,
    };
    // The type stored at approval wins: a later mode-of-payment change must not
    // block or re-route the order. Orders approved before routing existed have
    // no stored type, so they take the resolved one.
    let docType: OrderSapDocType;
    let routing: OrderSapPlaces;
    if (order.sapDocType) {
      docType = order.sapDocType;
      routing = resolveStoredOrderSapPlaces(docType, routingInput);
    } else {
      const resolved = resolveOrderSapRouting(routingInput);
      if (!resolved.ok) throw new Error(resolved.error);
      docType = resolved.docType;
      routing = resolved;
    }
    if (!routing.ok) throw new Error(routing.error);

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

  async createDispatchDocument({ tenantId, deliveryId, serialNumberIds }) {
    const creds = await sapServiceLayerService.getCredentials(tenantId);
    if (!creds) throw new Error("SAP Service Layer is not configured");

    const delivery = await prisma.branchDelivery.findFirst({
      where: { id: deliveryId, tenantId },
      include: {
        sourceWarehouse: { select: { code: true } },
        order: {
          include: {
            branch: { select: { sapCode: true, dealer: { select: { sapCode: true } } } },
            details: {
              orderBy: { id: "asc" },
              include: { model: { select: { skuCode: true } } },
            },
          },
        },
      },
    });
    if (!delivery) throw new Error("Delivery not found");
    const order = delivery.order;
    if (!order) throw new Error("Delivery has no order");
    // No base document to copy from: never post a loose transfer or delivery.
    if (order.sapDocEntry == null) throw new Error(LEGACY_ORDER_MESSAGE);
    const docType = docTypeForOrder(order);

    let sourceWhsCode = delivery.sourceWarehouse?.code ?? null;
    if (!sourceWhsCode) {
      const ctx = await orderRepository.findSapRoutingContext(tenantId, delivery.branchId, order.id);
      if (!ctx.branch) throw new Error("Branch not found");
      const routing = resolveOrderSapRouting({
        branch: ctx.branch,
        mainWarehouse: ctx.mainWarehouse,
        dealer: ctx.branch.dealer,
        orderModeOfPayment: ctx.orderModeOfPayment,
      });
      if (!routing.ok) throw new Error(routing.error);
      sourceWhsCode = routing.sourceWhsCode;
    }

    const serialRows = await prisma.serialNumber.findMany({
      where: { tenantId, id: { in: serialNumberIds } },
      select: { serialNo: true, modelId: true, model: { select: { skuCode: true } } },
      orderBy: { serialNo: "asc" },
    });
    if (serialRows.length !== serialNumberIds.length) {
      throw new Error("One or more serials were not found");
    }

    const lines = mapSerialsToLines(
      order.details.map((d) => ({
        modelId: d.modelId,
        skuCode: d.model.skuCode,
        capacity: d.approvedQty ?? d.quantity,
        sapLineNum: d.sapLineNum,
      })),
      serialRows.map((r) => ({ serialNo: r.serialNo, modelId: r.modelId, skuCode: r.model.skuCode })),
      order.sapDocEntry,
    );

    if (docType === "SO") {
      const cardCode = order.branch.dealer?.sapCode;
      if (!cardCode) throw new Error("Dealer has no SAP customer code");
      return postSapDocument(
        creds,
        "DR",
        order.orderNumber,
        buildDrBody({
          ismsRef: order.orderNumber,
          cardCode,
          whs: sourceWhsCode,
          baseSoEntry: order.sapDocEntry,
          lines,
        }),
      );
    }

    if (!order.branch.sapCode) throw new Error("Branch has no SAP warehouse code");
    return postSapDocument(
      creds,
      "IT",
      order.orderNumber,
      buildItBody({
        ismsRef: order.orderNumber,
        fromWhs: sourceWhsCode,
        toWhs: order.branch.sapCode,
        baseItrEntry: order.sapDocEntry,
        lines,
      }),
    );
  },

  async createDeliveryReturnDocument({ tenantId, userId, job }) {
    const returnId = job.referenceId;
    if (!returnId) throw new Error("Missing return request reference");
    try {
      return await postDeliveryReturn(tenantId, userId, job, returnId);
    } catch (error) {
      // The job runner records the failure; the return request shows it too.
      const message = error instanceof Error ? error.message : "SAP posting failed";
      // Never mark a completed (or cancelled) request as failed.
      await prisma.deliveryReturnRequest.updateMany({
        where: { id: returnId, tenantId, status: "APPROVED" },
        data: { sapError: message },
      });
      throw error;
    }
  },

  async createDeliveryTransferDocument({ tenantId, userId, job }) {
    const transferId = job.referenceId;
    if (!transferId) throw new Error("Missing unit transfer reference");
    try {
      return await postDeliveryTransfer(tenantId, userId, job, transferId);
    } catch (error) {
      // The job runner records the failure; the transfer shows it too.
      const message = error instanceof Error ? error.message : "SAP posting failed";
      // Never mark a cancelled or completed transfer as failed.
      await prisma.deliveryTransfer.updateMany({
        where: { id: transferId, tenantId, status: "IN_TRANSIT" },
        data: { sapError: message },
      });
      throw error;
    }
  },
};
