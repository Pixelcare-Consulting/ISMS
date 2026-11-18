import type { ReturnActionType } from "@prisma/client";

import { auditService } from "@/features/audit/services/audit.service";
import {
  recordReturnRequested,
  recordServiceInspectionDecided,
  type ReturnApprovalRef,
} from "@/features/inventory-approvals/services/return-approvals";
import { lockSerialNumbers } from "@/features/inventory/services/serial-placement";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import {
  isReplacementDocumentTypeName,
  isReturnDocumentTypeName,
  isServiceDocumentTypeName,
} from "@/features/sales/constants/process-return";
import {
  RESERVE_ODRF_CODE,
  returnHistoryStatusLabel,
} from "@/features/sales/constants/return-history-status";
import { TO_FOLLOW_SERIAL_LABEL } from "@/features/sales/constants/to-follow-serial";
import { generateAndStoreAtrOdrfPdf } from "@/features/sales/services/atr-odrf-pdf";
import type { ProcessReturnPayload } from "@/features/sales/services/process-return-input";
import { assertScInScope } from "@/features/service-center-ops/services/sc-scope";
import { assertSerialsNotFrozenInStockCount } from "@/features/stock-audit/services/stock-count-freeze";
import {
  notifyCsrScServiceReturnDecided,
  notifyScServiceReturnRequested,
} from "@/features/service-center-ops/services/sc-service-return-notify";
import { SC_ORDER_APPROVABLE_STATUSES } from "@/features/service-center-ordering/constants";
import { scOrderService } from "@/features/service-center-ordering/services/sc-order.service";
import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma/client";
import { logger } from "@/lib/shared/logger";

/**
 * Process V-b on service center sales. The CSR requests a Service Return / Replacement on an
 * SC sale line in SC Sales; the sold unit becomes Reserve ODRF in SC stock and the request waits
 * at `pending_sc` for the selling service center, which:
 * - Submit Return: puts the unit into SC stock as STK/DEF (the CSR's choice).
 * - Replace from SC stock: same, plus an SC STK unit becomes the sale line's unit (Sold).
 * - Special Order: no SC unit; a `special` SC order is raised and the request waits at
 *   `awaiting_stock` until that order's delivery is accepted (the unit is then held RSV).
 * - Reject: the unit goes back to the status it had (Sold / Reserved); the sale reopens.
 * Branch sales never route here.
 */

export interface ScServiceReturnActor {
  tenantId: string;
  userId: string;
  /** Service centers the actor may work on; null is every one. */
  scopedServiceCenterIds: string[] | null;
}

type Tx = Prisma.TransactionClient;

const STALE_REQUEST = "This request was already finished or changed. Refresh and try again.";

/** Codes a sold SC unit can have when a return is requested; a reject puts the same one back. */
const SOLD_CODES = ["SLD", "OFS", "RSV"] as const;
type SoldCode = (typeof SOLD_CODES)[number];

function isSoldCode(code: string | null | undefined): code is SoldCode {
  return (SOLD_CODES as readonly string[]).includes(code ?? "");
}

const requestSelect = {
  id: true,
  tenantId: true,
  status: true,
  actionType: true,
  stockStatusCode: true,
  saleDetailId: true,
  requestedById: true,
  heldSerialNumberId: true,
  specialOrderId: true,
  priorStatusCode: true,
  sale: {
    select: {
      id: true,
      transactionNo: true,
      serviceCenterId: true,
      serviceCenter: { select: { id: true, name: true, sapCode: true } },
      details: {
        orderBy: { createdAt: "asc" as const },
        select: { id: true, serialNumberId: true, brandId: true },
      },
    },
  },
} satisfies Prisma.ServiceCenterReturnRequestSelect;

type ScServiceRequest = Prisma.ServiceCenterReturnRequestGetPayload<{ select: typeof requestSelect }>;

function scLabel(center: { name: string; sapCode: string } | null): string {
  if (!center) return "Service center";
  return center.sapCode ? `${center.sapCode} · ${center.name}` : center.name;
}

function actionOf(request: { actionType: ReturnActionType | null }): ReturnActionType {
  return request.actionType === "replacement" ? "replacement" : "return";
}

function stockStatusOf(request: ScServiceRequest): "STK" | "DEF" {
  return request.stockStatusCode === "DEF" ? "DEF" : "STK";
}

function approvalRef(request: { id: string; tenantId: string }, transactionNo: string, serialNumberId: string): ReturnApprovalRef {
  return {
    tenantId: request.tenantId,
    sourceType: "SC_RETURN",
    sourceId: request.id,
    sourceNo: transactionNo,
    serialNumberId,
  };
}

/** The request, in scope, and still waiting on the service center. */
async function loadOpenRequest(actor: ScServiceReturnActor, returnRequestId: string): Promise<ScServiceRequest> {
  const row = await prisma.serviceCenterReturnRequest.findFirst({
    where: { id: returnRequestId, tenantId: actor.tenantId, documentTypeId: { not: null } },
    select: requestSelect,
  });
  if (!row) throw new Error("Service return not found");
  assertScInScope(row.sale.serviceCenterId, actor.scopedServiceCenterIds);
  if (row.status !== "pending_sc") {
    throw new Error(
      row.status === "awaiting_stock"
        ? "This replacement is waiting for its special order"
        : "This request is not waiting for the service center",
    );
  }
  return row;
}

/** The sale line this request is for. */
function targetLine(request: ScServiceRequest) {
  const line = request.sale.details.find((detail) => detail.id === request.saleDetailId);
  if (!line?.serialNumberId) throw new Error("This sale line has no serial number to return");
  return { ...line, serialNumberId: line.serialNumberId };
}

async function requireLocation(serviceCenterId: string, serviceCenterLocationId: string) {
  const location = await prisma.serviceCenterLocation.findFirst({
    where: { id: serviceCenterLocationId, serviceCenterId },
    select: { id: true, code: true, name: true },
  });
  if (!location) throw new Error("That location is not at this service center");
  return location;
}

/** Move the request on only if nobody else did first. */
async function claimRequest(
  tx: Tx,
  requestId: string,
  data: Prisma.ServiceCenterReturnRequestUncheckedUpdateManyInput,
) {
  const claimed = await tx.serviceCenterReturnRequest.updateMany({
    where: { id: requestId, status: "pending_sc" },
    data,
  });
  if (claimed.count !== 1) throw new Error(STALE_REQUEST);
}

async function inventoryCodeId(tenantId: string, code: string): Promise<string> {
  return reasonStatusService.requireCodeId(tenantId, "inventory_system", code);
}

/**
 * The returned unit, Reserve ODRF in this service center's stock, goes to `locationId` as
 * STK or DEF.
 */
async function restockReturnedUnit(
  tx: Tx,
  input: {
    tenantId: string;
    serviceCenterId: string;
    serialNumberId: string;
    odrfCodeId: string;
    locationId: string;
    stockCodeId: string;
  },
) {
  const moved = await tx.serviceCenterInventory.updateMany({
    where: {
      tenantId: input.tenantId,
      serviceCenterId: input.serviceCenterId,
      serialNumberId: input.serialNumberId,
      statusCodeId: input.odrfCodeId,
    },
    data: { serviceCenterLocationId: input.locationId, statusCodeId: input.stockCodeId },
  });
  if (moved.count !== 1) {
    throw new Error("The returned unit is no longer Reserve ODRF at this service center");
  }
}

/** A unit the SC held for this request goes back to SC stock when another unit is used. */
async function releaseHeldUnit(
  tx: Tx,
  input: { tenantId: string; serialNumberId: string | null; keepSerialNumberId?: string; rsvCodeId: string; stkCodeId: string },
) {
  if (!input.serialNumberId || input.serialNumberId === input.keepSerialNumberId) return;
  await tx.serviceCenterInventory.updateMany({
    where: { tenantId: input.tenantId, serialNumberId: input.serialNumberId, statusCodeId: input.rsvCodeId },
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
    serviceCenterName: scLabel(request.sale.serviceCenter),
    outcome,
    reason,
  });
}

/** Checks the CSR's document type, problems, and optional service extras. */
async function validateRequestInput(tenantId: string, data: ProcessReturnPayload) {
  const documentType = await prisma.documentType.findFirst({
    where: { id: data.documentTypeId, tenantId, recordStatus: "active" },
    select: { id: true, name: true },
  });
  if (!documentType) throw new Error("Document type not found or inactive");
  if (!isServiceDocumentTypeName(documentType.name)) {
    throw new Error("Service center sales take Service Return or Service Replacement only");
  }
  if (data.actionType === "return" && !isReturnDocumentTypeName(documentType.name)) {
    throw new Error("Selected document type requires Replacement, not Return");
  }
  if (data.actionType === "replacement" && !isReplacementDocumentTypeName(documentType.name)) {
    throw new Error("Selected document type requires Return, not Replacement");
  }

  const problems = await prisma.problemDescription.findMany({
    where: { tenantId, recordStatus: "active", id: { in: data.problemDescriptionIds } },
    select: { id: true, name: true },
  });
  const problemById = new Map(problems.map((problem) => [problem.id, problem]));
  const ordered = data.problemDescriptionIds
    .map((id) => problemById.get(id))
    .filter((problem): problem is { id: string; name: string } => Boolean(problem));
  if (ordered.length === 0) throw new Error("Select at least one problem description");

  const [serviceModel, warehouseLocation] = await Promise.all([
    data.serviceModelId
      ? prisma.productModel.findFirst({
          where: { id: data.serviceModelId, tenantId, status: "active" },
          select: { id: true, skuCode: true, name: true },
        })
      : Promise.resolve(null),
    data.warehouseLocationId
      ? prisma.warehouseLocation.findFirst({
          where: { id: data.warehouseLocationId, warehouse: { tenantId } },
          select: { id: true, code: true, name: true, warehouse: { select: { code: true, name: true } } },
        })
      : Promise.resolve(null),
  ]);
  if (data.serviceModelId && !serviceModel) throw new Error("Service model not found");
  if (data.warehouseLocationId && !warehouseLocation) throw new Error("Warehouse location not found");

  return {
    documentType,
    problemDescriptionId: ordered[0]!.id,
    problemDescriptionText: ordered.map((problem) => problem.name).join("; "),
    serviceModel,
    warehouseLocation,
  };
}

export const scServiceReturnService = {
  /**
   * CSR, SC Sales: request a Service Return / Replacement on one SC sale line. The unit
   * becomes Reserve ODRF in SC stock, the sale goes to reserve, and the selling service
   * center is notified.
   */
  async request(
    actor: ScServiceReturnActor,
    input: { saleId: string; payload: ProcessReturnPayload; requesterName: string },
  ): Promise<{ id: string }> {
    const { payload } = input;
    const checked = await validateRequestInput(actor.tenantId, payload);

    const sale = await prisma.serviceCenterSalesTransaction.findFirst({
      where: { id: input.saleId, tenantId: actor.tenantId },
      select: {
        id: true,
        transactionNo: true,
        transactionDate: true,
        customerName: true,
        atrStatus: true,
        notes: true,
        serviceCenterId: true,
        serviceCenter: { select: { name: true, sapCode: true } },
        returnRequest: { select: { id: true } },
        details: {
          select: {
            id: true,
            serialNumberId: true,
            saleAmount: true,
            amount: true,
            model: { select: { skuCode: true, name: true } },
            serialNumber: { select: { serialNo: true } },
          },
        },
      },
    });
    if (!sale) throw new Error("Sale not found");
    assertScInScope(sale.serviceCenterId, actor.scopedServiceCenterIds);
    if (sale.returnRequest) throw new Error("Return already requested");
    if (sale.atrStatus !== "open") throw new Error("Sale is not eligible for return");
    const line = sale.details.find((detail) => detail.id === payload.saleDetailId);
    if (!line) throw new Error("Selected sale line does not belong to this transaction");
    if (!line.serialNumberId) throw new Error("Encode the serial number on this line before requesting a return");
    const serialNumberId = line.serialNumberId;

    const odrfCodeId = await reasonStatusService.findCodeId(actor.tenantId, "inventory_system", RESERVE_ODRF_CODE);
    if (!odrfCodeId) throw new Error("Status code not configured: inventory_system/ODRF");

    const actionLabel = payload.actionType === "replacement" ? "Replacement" : "Return";
    const summaryNote = `[${actionLabel} requested] ${checked.documentType.name} · ${payload.stockStatusCode} · ${checked.problemDescriptionText}`;

    const created = await prisma.$transaction(async (tx) => {
      await lockSerialNumbers(tx, [serialNumberId]);
      const unit = await tx.serviceCenterInventory.findFirst({
        where: { tenantId: actor.tenantId, serviceCenterId: sale.serviceCenterId, serialNumberId },
        select: { id: true, statusCode: { select: { code: true } } },
      });
      const priorCode = unit?.statusCode?.code;
      if (!unit || !isSoldCode(priorCode)) {
        throw new Error(`${line.serialNumber?.serialNo ?? "This unit"} is not Sold at ${sale.serviceCenter.name}`);
      }

      const request = await tx.serviceCenterReturnRequest.create({
        data: {
          tenantId: actor.tenantId,
          saleId: sale.id,
          saleDetailId: line.id,
          status: "pending_sc",
          requestedById: actor.userId,
          actionType: payload.actionType,
          stockStatusCode: payload.stockStatusCode,
          documentTypeId: checked.documentType.id,
          problemDescriptionId: checked.problemDescriptionId,
          problemDescriptionText: checked.problemDescriptionText,
          priorStatusCode: priorCode,
          classification: payload.classification?.trim() || null,
          serviceModelId: checked.serviceModel?.id ?? null,
          customerDealerBranch: payload.customerDealerBranch?.trim() || null,
          natureOfTransaction: payload.natureOfTransaction?.trim() || null,
          refContactPo: payload.refContactPo?.trim() || null,
          warehouseLocationId: checked.warehouseLocation?.id ?? null,
          requestNotes: summaryNote,
        },
        select: { id: true, tenantId: true, createdAt: true },
      });
      // Claimed against the sold code just read, so a concurrent change fails here.
      const held = await tx.serviceCenterInventory.updateMany({
        where: { id: unit.id, statusCode: { code: priorCode } },
        data: { statusCodeId: odrfCodeId },
      });
      if (held.count !== 1) throw new Error(STALE_REQUEST);
      await tx.serviceCenterSalesTransaction.update({
        where: { id: sale.id },
        data: { atrStatus: "reserve", notes: [sale.notes, summaryNote].filter(Boolean).join("\n") },
      });
      await tx.serialNumberHistory.create({
        data: {
          tenantId: actor.tenantId,
          serialNumberId,
          txnType: payload.actionType === "replacement" ? "replacement" : "return",
          details: `Service ${actionLabel.toLowerCase()} requested on ${sale.transactionNo} at ${scLabel(sale.serviceCenter)} · was ${priorCode} (request ${request.id})`,
          status: "Reserve ODRF",
          createdById: actor.userId,
        },
      });
      await recordReturnRequested(
        tx,
        approvalRef(request, sale.transactionNo, serialNumberId),
        { requestedById: actor.userId, problemDescription: checked.problemDescriptionText },
        "INSPECTION",
      );
      return request;
    });

    // Best effort: the request stands even when the PDF cannot be stored.
    try {
      const path = await generateAndStoreAtrOdrfPdf({
        tenantId: actor.tenantId,
        returnRequestId: created.id,
        data: {
          documentTitle: "ATR / ODRF",
          actionTypeLabel: actionLabel,
          transactionNo: sale.transactionNo,
          transactionDate: sale.transactionDate ? sale.transactionDate.toLocaleDateString() : null,
          branchName: sale.serviceCenter.name,
          customerName: sale.customerName,
          documentTypeName: checked.documentType.name,
          stockStatusCode: payload.stockStatusCode,
          problemDescriptionText: checked.problemDescriptionText,
          requestedByName: input.requesterName,
          requestedAt: created.createdAt.toLocaleString(),
          serviceCenterName: scLabel(sale.serviceCenter),
          classification: payload.classification,
          serviceModelLabel: checked.serviceModel
            ? checked.serviceModel.skuCode
              ? `${checked.serviceModel.skuCode} · ${checked.serviceModel.name}`
              : checked.serviceModel.name
            : null,
          customerDealerBranch: payload.customerDealerBranch,
          natureOfTransaction: payload.natureOfTransaction,
          refContactPo: payload.refContactPo,
          warehouseLocationLabel: checked.warehouseLocation
            ? [
                checked.warehouseLocation.warehouse.code || checked.warehouseLocation.warehouse.name,
                checked.warehouseLocation.code || checked.warehouseLocation.name,
              ]
                .filter(Boolean)
                .join(" · ")
            : null,
          lines: [
            {
              modelLabel: line.model ? line.model.skuCode || line.model.name || "—" : "—",
              serialNo: line.serialNumber?.serialNo ?? TO_FOLLOW_SERIAL_LABEL,
              saleAmount: (line.saleAmount ?? line.amount ?? 0).toString(),
            },
          ],
        },
      });
      await prisma.serviceCenterReturnRequest.update({ where: { id: created.id }, data: { atrOdrfPdfPath: path } });
    } catch (error) {
      logger.warn({ tenantId: actor.tenantId, returnRequestId: created.id, err: error }, "sc service return ATR/ODRF PDF failed");
    }

    await auditService.log({
      tenantId: actor.tenantId,
      userId: actor.userId,
      action: "sc_sale.service_return_requested",
      entityType: "ServiceCenterSalesTransaction",
      entityId: sale.id,
      metadata: {
        transactionNo: sale.transactionNo,
        returnRequestId: created.id,
        actionType: payload.actionType,
        stockStatusCode: payload.stockStatusCode,
        documentTypeId: checked.documentType.id,
        saleDetailId: line.id,
      },
    });
    await notifyScServiceReturnRequested({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      returnRequestId: created.id,
      serviceCenterId: sale.serviceCenterId,
      transactionNo: sale.transactionNo,
      actionType: payload.actionType,
      serialNo: line.serialNumber?.serialNo ?? null,
    });
    return { id: created.id };
  },

  /** 8a. No replacement: the returned unit goes into SC stock; the request completes. */
  async submitReturn(actor: ScServiceReturnActor, input: { returnRequestId: string; serviceCenterLocationId: string }) {
    const request = await loadOpenRequest(actor, input.returnRequestId);
    if (actionOf(request) !== "return") {
      throw new Error("This request is a Service Replacement. Replace the unit or raise a special order.");
    }
    const line = targetLine(request);
    const serviceCenterId = request.sale.serviceCenterId;
    const location = await requireLocation(serviceCenterId, input.serviceCenterLocationId);
    const stockStatus = stockStatusOf(request);
    const [odrfCodeId, stockCodeId] = await Promise.all([
      inventoryCodeId(actor.tenantId, RESERVE_ODRF_CODE),
      inventoryCodeId(actor.tenantId, stockStatus),
    ]);
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      await claimRequest(tx, request.id, {
        status: "completed",
        completedAt: now,
        inspectedById: actor.userId,
        inspectedAt: now,
        serviceCenterLocationId: location.id,
      });
      await lockSerialNumbers(tx, [line.serialNumberId]);
      await restockReturnedUnit(tx, {
        tenantId: actor.tenantId,
        serviceCenterId,
        serialNumberId: line.serialNumberId,
        odrfCodeId,
        locationId: location.id,
        stockCodeId,
      });
      await tx.serviceCenterSalesTransaction.update({ where: { id: request.sale.id }, data: { atrStatus: "closed" } });
      await tx.serialNumberHistory.create({
        data: {
          tenantId: actor.tenantId,
          serialNumberId: line.serialNumberId,
          txnType: "return",
          details: `Service return ${request.sale.transactionNo} → ${stockStatus} at ${scLabel(request.sale.serviceCenter)} / ${location.code} (request ${request.id})`,
          status: returnHistoryStatusLabel(true, "return"),
          createdById: actor.userId,
        },
      });
      await recordServiceInspectionDecided(tx, approvalRef(request, request.sale.transactionNo, line.serialNumberId), {
        status: "APPROVED",
        decidedById: actor.userId,
      });
    });

    await auditService.log({
      tenantId: actor.tenantId,
      userId: actor.userId,
      action: "return.sc_return_completed",
      entityType: "ServiceCenterReturnRequest",
      entityId: request.id,
      metadata: {
        transactionNo: request.sale.transactionNo,
        serviceCenterId,
        serviceCenterLocationId: location.id,
        stockStatusCode: stockStatus,
      },
    });
    await afterDecision(actor, request, "COMPLETED");
  },

  /** Replacement candidates: SC STK of a model, plus the unit held from a special order. */
  async listReplacementStock(actor: ScServiceReturnActor, input: { returnRequestId: string; modelId?: string | null }) {
    const request = await loadOpenRequest(actor, input.returnRequestId);
    const [stkCodeId, rsvCodeId] = await Promise.all([
      inventoryCodeId(actor.tenantId, "STK"),
      inventoryCodeId(actor.tenantId, "RSV"),
    ]);
    const available: Prisma.ServiceCenterInventoryWhereInput = {
      tenantId: actor.tenantId,
      serviceCenterId: request.sale.serviceCenterId,
      OR: [
        { statusCodeId: stkCodeId },
        ...(request.heldSerialNumberId ? [{ statusCodeId: rsvCodeId, serialNumberId: request.heldSerialNumberId }] : []),
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
   * 8b. Replacement from SC stock on the same invoice: the returned unit goes into SC stock and
   * the chosen SC unit becomes the sale line's unit, Sold in place. The sale amount does not change.
   */
  async completeReplacement(
    actor: ScServiceReturnActor,
    input: { returnRequestId: string; serviceCenterLocationId: string; modelId: string; replacementSerialNumberId: string },
  ) {
    const request = await loadOpenRequest(actor, input.returnRequestId);
    if (actionOf(request) !== "replacement") {
      throw new Error("This request is a Service Return. Submit the return instead.");
    }
    const line = targetLine(request);
    if (input.replacementSerialNumberId === line.serialNumberId) {
      throw new Error("Choose a different unit from the returned one");
    }
    const serviceCenterId = request.sale.serviceCenterId;
    const location = await requireLocation(serviceCenterId, input.serviceCenterLocationId);
    const stockStatus = stockStatusOf(request);
    const [odrfCodeId, stockCodeId, stkCodeId, rsvCodeId, sldCodeId] = await Promise.all([
      inventoryCodeId(actor.tenantId, RESERVE_ODRF_CODE),
      inventoryCodeId(actor.tenantId, stockStatus),
      inventoryCodeId(actor.tenantId, "STK"),
      inventoryCodeId(actor.tenantId, "RSV"),
      inventoryCodeId(actor.tenantId, "SLD"),
    ]);

    const replacement = await prisma.serialNumber.findFirst({
      where: { id: input.replacementSerialNumberId, tenantId: actor.tenantId, modelId: input.modelId },
      select: { id: true, serialNo: true, model: { select: { id: true, brandId: true } } },
    });
    if (!replacement) throw new Error("Replacement unit not found for that model");
    await assertSerialsNotFrozenInStockCount(actor.tenantId, [replacement.id]);

    const now = new Date();
    const scName = scLabel(request.sale.serviceCenter);
    await prisma.$transaction(async (tx) => {
      await claimRequest(tx, request.id, {
        status: "completed",
        completedAt: now,
        inspectedById: actor.userId,
        inspectedAt: now,
        serviceCenterLocationId: location.id,
        heldSerialNumberId: null,
        replacementSerialNumberId: replacement.id,
      });
      await lockSerialNumbers(tx, [line.serialNumberId, replacement.id]);

      // The replacement must still be SC STK here, or the unit held for this request. It is
      // sold in place, like any unit an SC sale takes.
      const sold = await tx.serviceCenterInventory.updateMany({
        where: {
          tenantId: actor.tenantId,
          serviceCenterId,
          serialNumberId: replacement.id,
          OR: [
            { statusCodeId: stkCodeId },
            ...(request.heldSerialNumberId === replacement.id ? [{ statusCodeId: rsvCodeId }] : []),
          ],
        },
        data: { statusCodeId: sldCodeId },
      });
      if (sold.count !== 1) throw new Error(`${replacement.serialNo} is no longer in this service center's stock`);

      await restockReturnedUnit(tx, {
        tenantId: actor.tenantId,
        serviceCenterId,
        serialNumberId: line.serialNumberId,
        odrfCodeId,
        locationId: location.id,
        stockCodeId,
      });
      await releaseHeldUnit(tx, {
        tenantId: actor.tenantId,
        serialNumberId: request.heldSerialNumberId,
        keepSerialNumberId: replacement.id,
        rsvCodeId,
        stkCodeId,
      });

      // The sale line keeps the original serial; the replacement is on the request
      // (replacementSerialNumberId), like branch replacements.
      await tx.serviceCenterSalesTransactionDetail.update({
        where: { id: line.id },
        data: { statusCodeId: sldCodeId },
      });
      await tx.serviceCenterSalesTransaction.update({ where: { id: request.sale.id }, data: { atrStatus: "closed" } });

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
      await recordServiceInspectionDecided(tx, approvalRef(request, request.sale.transactionNo, line.serialNumberId), {
        status: "APPROVED",
        decidedById: actor.userId,
      });
    });

    await auditService.log({
      tenantId: actor.tenantId,
      userId: actor.userId,
      action: "return.sc_replacement_completed",
      entityType: "ServiceCenterReturnRequest",
      entityId: request.id,
      metadata: {
        transactionNo: request.sale.transactionNo,
        serviceCenterId,
        serviceCenterLocationId: location.id,
        stockStatusCode: stockStatus,
        replacementSerialNumberId: replacement.id,
      },
    });
    await afterDecision(actor, request, "COMPLETED");
  },

  /**
   * 8c. Replacement not in SC stock: raise a special SC order for one unit. It runs the SC order
   * process (approval, SAP SO, DR, delivery); the request waits at `awaiting_stock`.
   */
  async raiseSpecialOrder(
    actor: ScServiceReturnActor,
    input: { returnRequestId: string; modelId: string; serviceCenterLocationId?: string | null; poNumber?: string | null },
  ) {
    const request = await loadOpenRequest(actor, input.returnRequestId);
    if (actionOf(request) !== "replacement") throw new Error("Only a Service Replacement can raise a special order");
    const serviceCenterId = request.sale.serviceCenterId;
    if (input.serviceCenterLocationId) await requireLocation(serviceCenterId, input.serviceCenterLocationId);

    const order = await scOrderService.create(actor.tenantId, actor.userId, {
      serviceCenterId,
      serviceCenterLocationId: input.serviceCenterLocationId ?? null,
      poNumber: input.poNumber ?? null,
      notes: `Service Replacement for ${request.sale.transactionNo} (request ${request.id})`,
      orderType: "special",
      lines: [{ modelId: input.modelId, quantity: 1 }],
    });

    const linked = await prisma.serviceCenterReturnRequest.updateMany({
      where: { id: request.id, status: "pending_sc", specialOrderId: null },
      data: { status: "awaiting_stock", specialOrderId: order.id },
    });
    if (linked.count !== 1) {
      // Someone finished the request meanwhile: the order must not stay open for nothing.
      await prisma.serviceCenterOrder.updateMany({
        where: { id: order.id, status: { in: [...SC_ORDER_APPROVABLE_STATUSES] } },
        data: { status: "rejected", notes: `Cancelled: request ${request.id} was already finished` },
      });
      throw new Error(STALE_REQUEST);
    }

    await auditService.log({
      tenantId: actor.tenantId,
      userId: actor.userId,
      action: "return.sc_special_order_raised",
      entityType: "ServiceCenterReturnRequest",
      entityId: request.id,
      metadata: { orderId: order.id, orderNumber: order.orderNumber, modelId: input.modelId },
    });
    return order;
  },

  /** Reject at inspection: the unit gets its prior status (Sold / Reserved) back and the sale reopens. */
  async reject(actor: ScServiceReturnActor, input: { returnRequestId: string; reason: string }) {
    const request = await loadOpenRequest(actor, input.returnRequestId);
    const line = targetLine(request);
    const reason = input.reason.trim();
    if (!reason) throw new Error("Enter the reason for rejecting");
    const priorCode = isSoldCode(request.priorStatusCode) ? request.priorStatusCode : "SLD";
    const [odrfCodeId, priorCodeId, stkCodeId, rsvCodeId] = await Promise.all([
      inventoryCodeId(actor.tenantId, RESERVE_ODRF_CODE),
      inventoryCodeId(actor.tenantId, priorCode),
      inventoryCodeId(actor.tenantId, "STK"),
      inventoryCodeId(actor.tenantId, "RSV"),
    ]);
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      await claimRequest(tx, request.id, {
        status: "rejected",
        evaluationNotes: reason,
        inspectedById: actor.userId,
        inspectedAt: now,
        heldSerialNumberId: null,
      });
      await lockSerialNumbers(tx, [line.serialNumberId]);
      await tx.serviceCenterInventory.updateMany({
        where: {
          tenantId: actor.tenantId,
          serviceCenterId: request.sale.serviceCenterId,
          serialNumberId: line.serialNumberId,
          statusCodeId: odrfCodeId,
        },
        data: { statusCodeId: priorCodeId },
      });
      await tx.serviceCenterSalesTransaction.update({ where: { id: request.sale.id }, data: { atrStatus: "open" } });
      await releaseHeldUnit(tx, { tenantId: actor.tenantId, serialNumberId: request.heldSerialNumberId, rsvCodeId, stkCodeId });
      await tx.serialNumberHistory.create({
        data: {
          tenantId: actor.tenantId,
          serialNumberId: line.serialNumberId,
          txnType: actionOf(request) === "replacement" ? "replacement" : "return",
          details: `Service request rejected on ${request.sale.transactionNo}: ${reason} (request ${request.id})`,
          status: priorCode,
          createdById: actor.userId,
        },
      });
      await recordServiceInspectionDecided(tx, approvalRef(request, request.sale.transactionNo, line.serialNumberId), {
        status: "REJECTED",
        decidedById: actor.userId,
        remarks: reason,
      });
    });

    await auditService.log({
      tenantId: actor.tenantId,
      userId: actor.userId,
      action: "return.sc_rejected",
      entityType: "ServiceCenterReturnRequest",
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
  input: { tenantId: string; orderId: string | null; acceptedSerialNumberIds: string[] },
): Promise<{ returnRequestId: string; serviceCenterId: string; transactionNo: string; orderNumber: string } | null> {
  if (!input.orderId || input.acceptedSerialNumberIds.length === 0) return null;
  const request = await tx.serviceCenterReturnRequest.findFirst({
    where: { tenantId: input.tenantId, specialOrderId: input.orderId, status: "awaiting_stock" },
    select: {
      id: true,
      sale: { select: { transactionNo: true, serviceCenterId: true } },
      specialOrder: { select: { orderNumber: true, details: { select: { modelId: true } } } },
    },
  });
  if (!request?.specialOrder) return null;

  const orderedModelIds = request.specialOrder.details.map((detail) => detail.modelId);
  const unit = await tx.serialNumber.findFirst({
    where: { id: { in: input.acceptedSerialNumberIds }, modelId: { in: orderedModelIds } },
    select: { id: true },
    orderBy: { serialNo: "asc" },
  });
  const rsvCodeId = await inventoryCodeId(input.tenantId, "RSV");
  if (unit) {
    await tx.serviceCenterInventory.updateMany({
      where: { tenantId: input.tenantId, serialNumberId: unit.id },
      data: { statusCodeId: rsvCodeId },
    });
  }
  await tx.serviceCenterReturnRequest.update({
    where: { id: request.id },
    data: { status: "pending_sc", heldSerialNumberId: unit?.id ?? null },
  });
  return {
    returnRequestId: request.id,
    serviceCenterId: request.sale.serviceCenterId,
    transactionNo: request.sale.transactionNo,
    orderNumber: request.specialOrder.orderNumber,
  };
}

/** A special order that will not arrive puts its Service Replacement back with the SC. */
export async function releaseReturnFromRejectedOrder(
  tx: Tx,
  input: { tenantId: string; orderId: string },
): Promise<{ returnRequestId: string; serviceCenterId: string; transactionNo: string } | null> {
  const request = await tx.serviceCenterReturnRequest.findFirst({
    where: { tenantId: input.tenantId, specialOrderId: input.orderId, status: "awaiting_stock" },
    select: { id: true, sale: { select: { transactionNo: true, serviceCenterId: true } } },
  });
  if (!request) return null;
  await tx.serviceCenterReturnRequest.update({
    where: { id: request.id },
    data: { status: "pending_sc", specialOrderId: null },
  });
  return {
    returnRequestId: request.id,
    serviceCenterId: request.sale.serviceCenterId,
    transactionNo: request.sale.transactionNo,
  };
}
