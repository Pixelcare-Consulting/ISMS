import type { ReturnActionType } from "@prisma/client";

import { auditService } from "@/features/audit/services/audit.service";
import { recordServiceInspectionDecided } from "@/features/inventory-approvals/services/return-approvals";
import { statusUpdatedStamp } from "@/features/inventory/lib/status-updated-stamp";
import {
  loadCurrentPlacements,
  lockSerialNumbers,
} from "@/features/inventory/services/serial-placement";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import {
  RESERVE_ODRF_CODE,
  returnHistoryStatusLabel,
} from "@/features/sales/constants/return-history-status";
import { nextReplacementNo } from "@/features/sales/services/replacement-no";
import {
  loadReturnReserveCodeIds,
  restoreSerialAfterReturnReject,
  type ReturnReserveCodeIds,
} from "@/features/sales/services/return-unit-hold";
import { assertScInScope } from "@/features/service-center-ops/services/sc-scope";
import { notifyCsrScServiceReturnDecided } from "@/features/service-center-ops/services/sc-service-return-notify";
import { placeServiceCenterUnit } from "@/features/service-center-ops/services/service-center-placement";
import { scOrderService } from "@/features/service-center-ordering/services/sc-order.service";
import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma/client";

/**
 * Process V-b, service center lane. The CSR's Service Return / Replacement waits at
 * `pending_sc` with the sold unit Reserve ODRF at the branch sold. The service center:
 * - Submit Return: the unit goes into SC stock as STK/DEF (the CSR's choice).
 * - Replace from SC stock: same, plus an SC STK unit becomes the sale line's unit (Sold).
 * - Special Order: no SC unit; a `special` SC order is raised and the request waits at
 *   `awaiting_stock` until that order's delivery is accepted (the unit is then held RSV).
 * - Reject: the unit goes back to its prior Sold / Official Sold status; the sale reopens.
 */

export interface ScServiceReturnActor {
  tenantId: string;
  userId: string;
  /** Service centers the actor may work on; null is every one. */
  scopedServiceCenterIds: string[] | null;
}

type Tx = Prisma.TransactionClient;

const STALE_REQUEST = "This request was already finished or changed. Refresh and try again.";

const requestSelect = {
  id: true,
  tenantId: true,
  status: true,
  actionType: true,
  stockStatusCode: true,
  serviceCenterId: true,
  saleDetailId: true,
  requestedById: true,
  heldSerialNumberId: true,
  specialOrderId: true,
  documentType: { select: { name: true } },
  serviceCenter: { select: { id: true, name: true, sapCode: true } },
  sale: {
    select: {
      id: true,
      transactionNo: true,
      transactionDate: true,
      branchId: true,
      alternateBranchId: true,
      details: {
        orderBy: { createdAt: "asc" as const },
        select: {
          id: true,
          serialNumberId: true,
          modelId: true,
          brandId: true,
          modelPrice: true,
          saleAmount: true,
          amount: true,
          serialNumber: { select: { serialNo: true } },
        },
      },
    },
  },
} satisfies Prisma.BranchReturnRequestSelect;

type ScServiceRequest = Prisma.BranchReturnRequestGetPayload<{ select: typeof requestSelect }>;

/** The request, in scope, at a service center, and still waiting on the service center. */
async function loadOpenRequest(
  actor: ScServiceReturnActor,
  returnRequestId: string,
): Promise<ScServiceRequest & { serviceCenterId: string }> {
  const row = await prisma.branchReturnRequest.findFirst({
    where: { id: returnRequestId, tenantId: actor.tenantId },
    select: requestSelect,
  });
  if (!row || !row.serviceCenterId) throw new Error("Service return not found");
  assertScInScope(row.serviceCenterId, actor.scopedServiceCenterIds);
  if (row.status !== "pending_sc") {
    throw new Error(
      row.status === "awaiting_stock"
        ? "This replacement is waiting for its special order"
        : "This request is not waiting for the service center",
    );
  }
  return { ...row, serviceCenterId: row.serviceCenterId };
}

/** The sale line this request is for (legacy requests without a line use the first serial). */
function targetLine(request: ScServiceRequest) {
  const details = request.sale.details;
  const line = request.saleDetailId
    ? details.find((detail) => detail.id === request.saleDetailId)
    : details.find((detail) => detail.serialNumberId);
  if (!line?.serialNumberId) {
    throw new Error("This sale line has no serial number to return");
  }
  return { ...line, serialNumberId: line.serialNumberId };
}

function actionOf(request: ScServiceRequest): ReturnActionType {
  return request.actionType === "replacement" ? "replacement" : "return";
}

function scLabel(center: { name: string; sapCode: string } | null): string {
  if (!center) return "Service center";
  return center.sapCode ? `${center.sapCode} · ${center.name}` : center.name;
}

async function requireLocation(serviceCenterId: string, serviceCenterLocationId: string) {
  const location = await prisma.serviceCenterLocation.findFirst({
    where: { id: serviceCenterLocationId, serviceCenterId },
    select: { id: true, code: true, name: true },
  });
  if (!location) throw new Error("That location is not at this service center");
  return location;
}

/** Move the request to a finished state only if nobody else did first. */
async function claimRequest(
  tx: Tx,
  request: { id: string; status: "pending_sc" },
  data: Prisma.BranchReturnRequestUncheckedUpdateManyInput,
) {
  const claimed = await tx.branchReturnRequest.updateMany({
    where: { id: request.id, status: request.status },
    data,
  });
  if (claimed.count !== 1) throw new Error(STALE_REQUEST);
}

/**
 * The returned unit leaves the branch sold (Reserve ODRF, or still Sold / Official Sold on an
 * older request) and is placed at the service center location as STK or DEF.
 */
async function moveReturnedUnitToServiceCenter(
  tx: Tx,
  input: {
    tenantId: string;
    serialNumberId: string;
    branchIds: string[];
    soldCodeIds: string[];
    serviceCenterId: string;
    serviceCenterLocationId: string;
    stockCodeId: string;
  },
) {
  await lockSerialNumbers(tx, [input.serialNumberId]);
  const placements = (await loadCurrentPlacements(tx, [input.serialNumberId])).filter(
    (row) => row.tenantId === input.tenantId,
  );
  const branchRow = await tx.branchInventory.findFirst({
    where: {
      tenantId: input.tenantId,
      serialNumberId: input.serialNumberId,
      branchId: { in: input.branchIds },
      statusCodeId: { in: input.soldCodeIds },
    },
    select: { id: true },
  });
  if (branchRow) {
    await tx.branchInventory.delete({ where: { id: branchRow.id } });
  } else if (placements.some((row) => row.table !== "service_center")) {
    const where = placements.map((row) => row.place).join(", ");
    throw new Error(`The returned unit is not Reserve ODRF at the branch sold. It is at ${where}.`);
  }
  await placeServiceCenterUnit(tx, {
    tenantId: input.tenantId,
    serviceCenterId: input.serviceCenterId,
    serviceCenterLocationId: input.serviceCenterLocationId,
    serialNumberId: input.serialNumberId,
    statusCodeId: input.stockCodeId,
  });
}

async function loadReturnCodes(tenantId: string, stockStatusCode: "STK" | "DEF") {
  const [reserveCodes, stockCodeId] = await Promise.all([
    loadReturnReserveCodeIds(tenantId),
    reasonStatusService.requireCodeId(tenantId, "inventory_system", stockStatusCode),
  ]);
  if (!reserveCodes?.odrfCodeId) {
    throw new Error("Status code not configured: inventory_system/ODRF");
  }
  return { reserveCodes, stockCodeId };
}

function soldOrHeldCodeIds(codes: ReturnReserveCodeIds): string[] {
  return [codes.odrfCodeId, codes.sldCodeId, codes.ofsCodeId, codes.rsvCodeId].filter(
    (id): id is string => id !== null,
  );
}

function stockStatusOf(request: ScServiceRequest): "STK" | "DEF" {
  return request.stockStatusCode === "DEF" ? "DEF" : "STK";
}

function approvalRef(request: ScServiceRequest, serialNumberId: string) {
  return {
    tenantId: request.tenantId,
    sourceType: "SALES_RETURN" as const,
    sourceId: request.id,
    sourceNo: request.sale.transactionNo,
    serialNumberId,
  };
}

/** A unit the SC held for this request goes back to SC stock when another unit is used. */
async function releaseHeldUnit(
  tx: Tx,
  input: { tenantId: string; serialNumberId: string | null; keepSerialNumberId?: string; rsvCodeId: string; stkCodeId: string },
) {
  if (!input.serialNumberId || input.serialNumberId === input.keepSerialNumberId) return;
  await tx.serviceCenterInventory.updateMany({
    where: {
      tenantId: input.tenantId,
      serialNumberId: input.serialNumberId,
      statusCodeId: input.rsvCodeId,
    },
    data: { statusCodeId: input.stkCodeId },
  });
}

async function afterDecision(
  actor: ScServiceReturnActor,
  request: ScServiceRequest,
  outcome: "COMPLETED" | "REJECTED",
  reason?: string,
) {
  await notifyCsrScServiceReturnDecided({
    tenantId: actor.tenantId,
    actorUserId: actor.userId,
    returnRequestId: request.id,
    requestedById: request.requestedById,
    transactionNo: request.sale.transactionNo,
    actionType: request.actionType,
    serviceCenterName: scLabel(request.serviceCenter),
    outcome,
    reason,
  });
}

export const scServiceReturnService = {
  /** 8a. No replacement: the returned unit goes into SC stock; the request completes. */
  async submitReturn(
    actor: ScServiceReturnActor,
    input: { returnRequestId: string; serviceCenterLocationId: string },
  ) {
    const request = await loadOpenRequest(actor, input.returnRequestId);
    if (actionOf(request) !== "return") {
      throw new Error("This request is a Service Replacement. Replace the unit or raise a special order.");
    }
    const line = targetLine(request);
    const location = await requireLocation(request.serviceCenterId, input.serviceCenterLocationId);
    const stockStatus = stockStatusOf(request);
    const { reserveCodes, stockCodeId } = await loadReturnCodes(actor.tenantId, stockStatus);
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      await claimRequest(tx, { id: request.id, status: "pending_sc" }, {
        status: "completed",
        completedAt: now,
        inspectedById: actor.userId,
        inspectedAt: now,
        serviceCenterLocationId: location.id,
      });
      await moveReturnedUnitToServiceCenter(tx, {
        tenantId: actor.tenantId,
        serialNumberId: line.serialNumberId,
        branchIds: [request.sale.branchId, request.sale.alternateBranchId ?? request.sale.branchId],
        soldCodeIds: soldOrHeldCodeIds(reserveCodes),
        serviceCenterId: request.serviceCenterId,
        serviceCenterLocationId: location.id,
        stockCodeId,
      });
      await tx.branchSalesTransaction.update({
        where: { id: request.sale.id },
        data: { atrStatus: "closed" },
      });
      await tx.serialNumberHistory.create({
        data: {
          tenantId: actor.tenantId,
          serialNumberId: line.serialNumberId,
          txnType: "return",
          details: `Service return ${request.sale.transactionNo} → ${stockStatus} at ${scLabel(request.serviceCenter)} / ${location.code} (request ${request.id})`,
          status: returnHistoryStatusLabel(true, "return"),
          createdById: actor.userId,
        },
      });
      await recordServiceInspectionDecided(tx, approvalRef(request, line.serialNumberId), {
        status: "APPROVED",
        decidedById: actor.userId,
      });
    });

    await auditService.log({
      tenantId: actor.tenantId,
      userId: actor.userId,
      action: "return.sc_return_completed",
      entityType: "BranchReturnRequest",
      entityId: request.id,
      metadata: {
        transactionNo: request.sale.transactionNo,
        serviceCenterId: request.serviceCenterId,
        serviceCenterLocationId: location.id,
        stockStatusCode: stockStatus,
      },
    });
    await afterDecision(actor, request, "COMPLETED");
  },

  /** Replacement candidates: SC STK of a model, plus the unit held from a special order. */
  async listReplacementStock(
    actor: ScServiceReturnActor,
    input: { returnRequestId: string; modelId?: string | null },
  ) {
    const request = await loadOpenRequest(actor, input.returnRequestId);
    const [stkCodeId, rsvCodeId] = await Promise.all([
      reasonStatusService.requireCodeId(actor.tenantId, "inventory_system", "STK"),
      reasonStatusService.requireCodeId(actor.tenantId, "inventory_system", "RSV"),
    ]);
    const available: Prisma.ServiceCenterInventoryWhereInput = {
      tenantId: actor.tenantId,
      serviceCenterId: request.serviceCenterId,
      OR: [
        { statusCodeId: stkCodeId },
        ...(request.heldSerialNumberId
          ? [{ statusCodeId: rsvCodeId, serialNumberId: request.heldSerialNumberId }]
          : []),
      ],
    };

    const [modelGroups, serials] = await Promise.all([
      prisma.serviceCenterInventory.findMany({
        where: available,
        select: { serialNumber: { select: { model: { select: { id: true, skuCode: true, name: true } } } } },
        take: 5000,
      }),
      input.modelId
        ? prisma.serviceCenterInventory.findMany({
            where: { ...available, serialNumber: { modelId: input.modelId } },
            select: {
              serialNumberId: true,
              serialNumber: { select: { serialNo: true } },
              serviceCenterLocation: { select: { code: true } },
            },
            orderBy: { serialNumber: { serialNo: "asc" } },
            take: 500,
          })
        : Promise.resolve([]),
    ]);

    const models = new Map<string, { id: string; name: string; count: number }>();
    for (const row of modelGroups) {
      const model = row.serialNumber.model;
      const existing = models.get(model.id);
      if (existing) existing.count += 1;
      else models.set(model.id, { id: model.id, name: model.skuCode ? `${model.skuCode} · ${model.name}` : model.name, count: 1 });
    }

    return {
      models: [...models.values()].sort((a, b) => a.name.localeCompare(b.name)),
      serials: serials.map((row) => ({
        id: row.serialNumberId,
        serialNo: row.serialNumber.serialNo,
        locationCode: row.serviceCenterLocation.code,
        held: row.serialNumberId === request.heldSerialNumberId,
      })),
    };
  },

  /**
   * 8b. Replacement from SC stock on the same invoice: the returned unit goes into SC stock,
   * the chosen SC unit becomes the sale line's unit and is Sold at the branch sold.
   * The sale amount does not change.
   */
  async completeReplacement(
    actor: ScServiceReturnActor,
    input: {
      returnRequestId: string;
      serviceCenterLocationId: string;
      modelId: string;
      replacementSerialNumberId: string;
    },
  ) {
    const request = await loadOpenRequest(actor, input.returnRequestId);
    if (actionOf(request) !== "replacement") {
      throw new Error("This request is a Service Return. Submit the return instead.");
    }
    const line = targetLine(request);
    if (input.replacementSerialNumberId === line.serialNumberId) {
      throw new Error("Choose a different unit from the returned one");
    }
    const location = await requireLocation(request.serviceCenterId, input.serviceCenterLocationId);
    const stockStatus = stockStatusOf(request);
    const [{ reserveCodes, stockCodeId }, stkCodeId] = await Promise.all([
      loadReturnCodes(actor.tenantId, stockStatus),
      reasonStatusService.requireCodeId(actor.tenantId, "inventory_system", "STK"),
    ]);

    const replacement = await prisma.serialNumber.findFirst({
      where: { id: input.replacementSerialNumberId, tenantId: actor.tenantId, modelId: input.modelId },
      select: { id: true, serialNo: true, model: { select: { id: true, brandId: true } } },
    });
    if (!replacement) throw new Error("Replacement unit not found for that model");

    const now = new Date();
    const scName = scLabel(request.serviceCenter);
    await prisma.$transaction(async (tx) => {
      await claimRequest(tx, { id: request.id, status: "pending_sc" }, {
        status: "completed",
        completedAt: now,
        inspectedById: actor.userId,
        inspectedAt: now,
        serviceCenterLocationId: location.id,
        heldSerialNumberId: null,
      });
      await lockSerialNumbers(tx, [line.serialNumberId, replacement.id]);

      // The replacement must still be SC STK here, or the unit held for this request.
      const scRow = await tx.serviceCenterInventory.findFirst({
        where: {
          tenantId: actor.tenantId,
          serviceCenterId: request.serviceCenterId,
          serialNumberId: replacement.id,
          OR: [
            { statusCodeId: stkCodeId },
            ...(request.heldSerialNumberId === replacement.id
              ? [{ statusCodeId: reserveCodes.rsvCodeId }]
              : []),
          ],
        },
        select: { id: true },
      });
      if (!scRow) throw new Error(`${replacement.serialNo} is no longer in this service center's stock`);

      await moveReturnedUnitToServiceCenter(tx, {
        tenantId: actor.tenantId,
        serialNumberId: line.serialNumberId,
        branchIds: [request.sale.branchId, request.sale.alternateBranchId ?? request.sale.branchId],
        soldCodeIds: soldOrHeldCodeIds(reserveCodes),
        serviceCenterId: request.serviceCenterId,
        serviceCenterLocationId: location.id,
        stockCodeId,
      });

      // Replacement leaves SC stock and is Sold at the branch sold, like every branch sale unit.
      await tx.serviceCenterInventory.delete({ where: { id: scRow.id } });
      await tx.branchInventory.create({
        data: {
          tenantId: actor.tenantId,
          branchId: request.sale.branchId,
          serialNumberId: replacement.id,
          statusCodeId: reserveCodes.sldCodeId,
          updatedById: actor.userId,
          ...statusUpdatedStamp(null, "SLD"),
        },
      });
      await releaseHeldUnit(tx, {
        tenantId: actor.tenantId,
        serialNumberId: request.heldSerialNumberId,
        keepSerialNumberId: replacement.id,
        rsvCodeId: reserveCodes.rsvCodeId,
        stkCodeId,
      });

      await tx.branchSalesTransactionDetail.update({
        where: { id: line.id },
        data: {
          modelId: replacement.model.id,
          brandId: replacement.model.brandId ?? line.brandId,
          serialNumberId: replacement.id,
          statusCodeId: reserveCodes.sldCodeId,
        },
      });
      await tx.branchSalesTransaction.update({
        where: { id: request.sale.id },
        data: { atrStatus: "closed" },
      });

      const price = line.modelPrice ?? line.saleAmount ?? line.amount ?? null;
      await tx.salesReplacement.create({
        data: {
          tenantId: actor.tenantId,
          saleId: request.sale.id,
          replacementNo: await nextReplacementNo(actor.tenantId, tx),
          originalSerialNumberId: line.serialNumberId,
          originalModelPrice: price,
          originalInvoiceDate: request.sale.transactionDate,
          originalInvoiceNo: request.sale.transactionNo,
          replacementSerialNumberId: replacement.id,
          replacementServiceCenterId: request.serviceCenterId,
          replacementAmount: price,
          replacementModelPrice: price,
          replacementInvoiceDate: request.sale.transactionDate,
          replacementInvoiceNo: request.sale.transactionNo,
          transactedById: actor.userId,
          transactedAt: now,
        },
      });

      await tx.serialNumberHistory.createMany({
        data: [
          {
            tenantId: actor.tenantId,
            serialNumberId: line.serialNumberId,
            txnType: "replacement",
            details: `Service replacement ${request.sale.transactionNo} → ${stockStatus} at ${scName} / ${location.code} (request ${request.id})`,
            status: returnHistoryStatusLabel(true, "replacement"),
            createdById: actor.userId,
            createdAt: now,
          },
          {
            tenantId: actor.tenantId,
            serialNumberId: replacement.id,
            txnType: "replacement",
            details: `Service replacement from ${scName} sold on same invoice ${request.sale.transactionNo}`,
            status: "SLD",
            createdById: actor.userId,
            createdAt: now,
          },
        ],
      });
      await recordServiceInspectionDecided(tx, approvalRef(request, line.serialNumberId), {
        status: "APPROVED",
        decidedById: actor.userId,
      });
    });

    await auditService.log({
      tenantId: actor.tenantId,
      userId: actor.userId,
      action: "return.sc_replacement_completed",
      entityType: "BranchReturnRequest",
      entityId: request.id,
      metadata: {
        transactionNo: request.sale.transactionNo,
        serviceCenterId: request.serviceCenterId,
        serviceCenterLocationId: location.id,
        stockStatusCode: stockStatus,
        replacementSerialNumberId: replacement.id,
      },
    });
    await afterDecision(actor, request, "COMPLETED");
  },

  /**
   * 8c. Replacement not in SC stock: raise a special SC order for one unit. It runs the SC
   * order process (approval, SAP SO, DR, delivery); the request waits at `awaiting_stock`.
   */
  async raiseSpecialOrder(
    actor: ScServiceReturnActor,
    input: {
      returnRequestId: string;
      modelId: string;
      serviceCenterLocationId?: string | null;
      poNumber?: string | null;
    },
  ) {
    const request = await loadOpenRequest(actor, input.returnRequestId);
    if (actionOf(request) !== "replacement") {
      throw new Error("Only a Service Replacement can raise a special order");
    }
    if (input.serviceCenterLocationId) {
      await requireLocation(request.serviceCenterId, input.serviceCenterLocationId);
    }

    const order = await scOrderService.create(actor.tenantId, actor.userId, {
      serviceCenterId: request.serviceCenterId,
      serviceCenterLocationId: input.serviceCenterLocationId ?? null,
      poNumber: input.poNumber ?? null,
      notes: `Service Replacement for ${request.sale.transactionNo} (request ${request.id})`,
      orderType: "special",
      lines: [{ modelId: input.modelId, quantity: 1 }],
    });

    const linked = await prisma.branchReturnRequest.updateMany({
      where: { id: request.id, status: "pending_sc", specialOrderId: null },
      data: { status: "awaiting_stock", specialOrderId: order.id },
    });
    if (linked.count !== 1) {
      // Someone finished the request meanwhile: the order must not stay open for nothing.
      await prisma.serviceCenterOrder.updateMany({
        where: { id: order.id, status: "pending_tl" },
        data: { status: "rejected", notes: `Cancelled: request ${request.id} was already finished` },
      });
      throw new Error(STALE_REQUEST);
    }

    await auditService.log({
      tenantId: actor.tenantId,
      userId: actor.userId,
      action: "return.sc_special_order_raised",
      entityType: "BranchReturnRequest",
      entityId: request.id,
      metadata: { orderId: order.id, orderNumber: order.orderNumber, modelId: input.modelId },
    });
    return order;
  },

  /** Reject at inspection: the unit is Sold / Official Sold again and the sale reopens. */
  async reject(actor: ScServiceReturnActor, input: { returnRequestId: string; reason: string }) {
    const request = await loadOpenRequest(actor, input.returnRequestId);
    const line = targetLine(request);
    const reason = input.reason.trim();
    if (!reason) throw new Error("Enter the reason for rejecting");
    const [reserveCodes, stkCodeId] = await Promise.all([
      loadReturnReserveCodeIds(actor.tenantId),
      reasonStatusService.requireCodeId(actor.tenantId, "inventory_system", "STK"),
    ]);
    if (!reserveCodes) throw new Error("Sold, Official Sold, and Reserved are not set up");
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      await claimRequest(tx, { id: request.id, status: "pending_sc" }, {
        status: "rejected",
        evaluationNotes: reason,
        inspectedById: actor.userId,
        inspectedAt: now,
        heldSerialNumberId: null,
      });
      await tx.branchSalesTransaction.update({
        where: { id: request.sale.id },
        data: { atrStatus: "open" },
      });
      await restoreSerialAfterReturnReject(tx, {
        tenantId: actor.tenantId,
        userId: actor.userId,
        soldBranchId: request.sale.branchId,
        returnRequestId: request.id,
        codes: reserveCodes,
        holdCode: RESERVE_ODRF_CODE,
      });
      await releaseHeldUnit(tx, {
        tenantId: actor.tenantId,
        serialNumberId: request.heldSerialNumberId,
        rsvCodeId: reserveCodes.rsvCodeId,
        stkCodeId,
      });
      await recordServiceInspectionDecided(tx, approvalRef(request, line.serialNumberId), {
        status: "REJECTED",
        decidedById: actor.userId,
        remarks: reason,
      });
    });

    await auditService.log({
      tenantId: actor.tenantId,
      userId: actor.userId,
      action: "return.sc_rejected",
      entityType: "BranchReturnRequest",
      entityId: request.id,
      metadata: { transactionNo: request.sale.transactionNo, reason },
    });
    await afterDecision(actor, request, "REJECTED", reason);
  },
};

/**
 * Called inside the SC delivery accept transaction. When the delivery is for a special order
 * raised by a Service Replacement, the first accepted unit of the ordered model is held (RSV)
 * for it and the request goes back to the service center. Returns what to notify.
 */
export async function holdSpecialOrderUnitForReturn(
  tx: Tx,
  input: {
    tenantId: string;
    orderId: string | null;
    acceptedSerialNumberIds: string[];
  },
): Promise<{ returnRequestId: string; serviceCenterId: string; transactionNo: string; orderNumber: string } | null> {
  if (!input.orderId || input.acceptedSerialNumberIds.length === 0) return null;
  const request = await tx.branchReturnRequest.findFirst({
    where: { tenantId: input.tenantId, specialOrderId: input.orderId, status: "awaiting_stock" },
    select: {
      id: true,
      serviceCenterId: true,
      sale: { select: { transactionNo: true } },
      specialOrder: { select: { orderNumber: true, details: { select: { modelId: true } } } },
    },
  });
  if (!request?.serviceCenterId || !request.specialOrder) return null;

  const orderedModelIds = request.specialOrder.details.map((detail) => detail.modelId);
  const unit = await tx.serialNumber.findFirst({
    where: { id: { in: input.acceptedSerialNumberIds }, modelId: { in: orderedModelIds } },
    select: { id: true },
    orderBy: { serialNo: "asc" },
  });
  const rsvCodeId = await reasonStatusService.requireCodeId(input.tenantId, "inventory_system", "RSV");
  if (unit) {
    await tx.serviceCenterInventory.updateMany({
      where: { tenantId: input.tenantId, serialNumberId: unit.id },
      data: { statusCodeId: rsvCodeId },
    });
  }
  await tx.branchReturnRequest.update({
    where: { id: request.id },
    data: { status: "pending_sc", heldSerialNumberId: unit?.id ?? null },
  });
  return {
    returnRequestId: request.id,
    serviceCenterId: request.serviceCenterId,
    transactionNo: request.sale.transactionNo,
    orderNumber: request.specialOrder.orderNumber,
  };
}

/** A special order that will not arrive puts its Service Replacement back with the SC. */
export async function releaseReturnFromRejectedOrder(
  tx: Tx,
  input: { tenantId: string; orderId: string },
): Promise<{ returnRequestId: string; serviceCenterId: string; transactionNo: string } | null> {
  const request = await tx.branchReturnRequest.findFirst({
    where: { tenantId: input.tenantId, specialOrderId: input.orderId, status: "awaiting_stock" },
    select: { id: true, serviceCenterId: true, sale: { select: { transactionNo: true } } },
  });
  if (!request?.serviceCenterId) return null;
  await tx.branchReturnRequest.update({
    where: { id: request.id },
    data: { status: "pending_sc", specialOrderId: null },
  });
  return {
    returnRequestId: request.id,
    serviceCenterId: request.serviceCenterId,
    transactionNo: request.sale.transactionNo,
  };
}
