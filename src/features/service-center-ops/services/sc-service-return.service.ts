import type { AtrStatus, ReturnActionType, ReturnRequestStatus } from "@prisma/client";

import { auditService } from "@/features/audit/services/audit.service";
import {
  recordReturnRequested,
  recordServiceInspectionDecided,
  type ReturnApprovalRef,
} from "@/features/inventory-approvals/services/return-approvals";
import { statusUpdatedStamp } from "@/features/inventory/lib/status-updated-stamp";
import {
  assertExclusivePlacement,
  loadCurrentPlacements,
  lockSerialNumbers,
} from "@/features/inventory/services/serial-placement";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import { replacementContextRecord } from "@/features/serial-activity/lib/transaction-snapshot";
import {
  isReplacementDocumentTypeName,
  isReturnDocumentTypeName,
  isServiceDocumentTypeName,
} from "@/features/sales/constants/process-return";
import {
  RESERVE_ODRF_CODE,
  RESERVE_ODRF_STATUS,
  returnHistoryStatusLabel,
} from "@/features/sales/constants/return-history-status";
import { TO_FOLLOW_SERIAL_LABEL } from "@/features/sales/constants/to-follow-serial";
import { generateAndStoreAtrOdrfPdf } from "@/features/sales/services/atr-odrf-pdf";
import type { ProcessReturnPayload } from "@/features/sales/services/process-return-input";
import { nextReplacementNo } from "@/features/sales/services/replacement-no";
import { assertScInScope } from "@/features/service-center-ops/services/sc-scope";
import { assertSerialsNotFrozenInStockCount } from "@/features/stock-audit/services/stock-count-freeze";
import {
  notifyCsrScServiceReturnDecided,
  notifyScServiceReturnRequested,
} from "@/features/service-center-ops/services/sc-service-return-notify";
import { SC_ORDER_APPROVABLE_STATUSES } from "@/features/service-center-ordering/constants";
import { scOrderService } from "@/features/service-center-ordering/services/sc-order.service";
import { placeServiceCenterUnit } from "@/features/service-center-ops/services/service-center-placement";
import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma/client";
import { logger } from "@/lib/shared/logger";

/**
 * Process V-b. The CSR requests a Service Return / Replacement on a branch sale line and picks
 * a service center. The sale is copied to that service center (Sales → Service Center tab), the
 * unit moves from branch stock to the service center as Reserve ODRF, and the SC request on the
 * copy waits at `pending_sc`. The service center then:
 * - Submit Return (no inspection step): puts the unit into SC stock as STK/DEF (the CSR's choice).
 * - Replace from SC stock: same, plus the SC STK unit the service center chooses is sold to the
 *   customer. The sale lines keep the returned serial; the new one is on the request (and on a
 *   SalesReplacement row of the branch sale).
 * - Special Order: no SC unit; a `special` SC order is raised and the request waits at
 *   `awaiting_stock` until that order's delivery is accepted (the unit is then held RSV).
 * - Reject: the unit goes back to the status it had (Sold / Reserved) at the branch; the sale reopens.
 * Every step is mirrored on the branch sale's return request, so branch Sales and Returns show
 * the same status. Older requests on sales encoded at a service center (no branch sale) run the
 * same steps with the unit staying at the service center.
 */

export interface ScServiceReturnActor {
  tenantId: string;
  userId: string;
  /** Service centers the actor may work on; null is every one. */
  scopedServiceCenterIds: string[] | null;
}

/** The CSR sending a branch sale's Service Return / Replacement to a service center. */
export interface BranchServiceReturnRequester {
  tenantId: string;
  userId: string;
  /** Printed on the ATR/ODRF. */
  name: string;
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
  customerDealerBranch: true,
  sale: {
    select: {
      id: true,
      transactionNo: true,
      transactionDate: true,
      customerName: true,
      contactNo: true,
      serviceCenterId: true,
      serviceCenter: { select: { id: true, name: true, sapCode: true } },
      sourceBranchSale: {
        select: { id: true, branchId: true, branch: { select: { name: true, dealerId: true } } },
      },
      details: {
        orderBy: { createdAt: "asc" as const },
        select: {
          id: true,
          serialNumberId: true,
          brandId: true,
          saleAmount: true,
          amount: true,
          serialNumber: { select: { serialNo: true } },
        },
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

function replacementContextForRequest(
  request: ScServiceRequest,
  serials: { returnedSerialNo?: string | null; replacedSerialNo?: string | null },
) {
  const line = request.sale.details.find((detail) => detail.id === request.saleDetailId);
  return replacementContextRecord({
    transactionNo: request.sale.transactionNo,
    transactionDate: request.sale.transactionDate,
    transactionAmount: line?.saleAmount ?? line?.amount,
    customerName: request.sale.customerName,
    customerNumber: request.sale.contactNo,
    returnedSerialNo: serials.returnedSerialNo ?? line?.serialNumber?.serialNo,
    replacedSerialNo: serials.replacedSerialNo,
  });
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
 * The SAP DR Special Instructions each unit last arrived at this service center with. Only the
 * latest delivery counts: an older one's note belongs to an earlier trip of the same serial.
 */
async function specialInstructionsForUnits(serviceCenterId: string, serialNumberIds: string[]): Promise<Map<string, string>> {
  if (serialNumberIds.length === 0) return new Map();
  const lines = await prisma.serviceCenterDeliveryLine.findMany({
    where: { serialNumberId: { in: serialNumberIds }, returnedAt: null, delivery: { serviceCenterId } },
    select: { serialNumberId: true, sapSpecialInstructions: true },
    orderBy: { createdAt: "desc" },
  });
  const bySerial = new Map<string, string>();
  const seen = new Set<string>();
  for (const line of lines) {
    if (seen.has(line.serialNumberId)) continue;
    seen.add(line.serialNumberId);
    if (line.sapSpecialInstructions) bySerial.set(line.serialNumberId, line.sapSpecialInstructions);
  }
  return bySerial;
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

/**
 * The service center the CSR picked, active, with the location the unit waits at as Reserve
 * ODRF (its first by code). The service center chooses the receiving location when it finishes.
 */
async function requireReceivingServiceCenter(tenantId: string, serviceCenterId: string | null | undefined) {
  const id = serviceCenterId?.trim();
  if (!id) throw new Error("Service center is required for Service Return / Replacement");
  const center = await prisma.serviceCenter.findFirst({
    where: { id, tenantId, deletedAt: null, status: "active" },
    select: {
      id: true,
      name: true,
      sapCode: true,
      locations: { orderBy: { code: "asc" }, take: 1, select: { id: true, code: true } },
    },
  });
  if (!center) throw new Error("Service center not found");
  const holdLocation = center.locations[0];
  if (!holdLocation) {
    throw new Error(`${center.name} has no locations yet. Add one in Settings → Service Centers first.`);
  }
  return { id: center.id, name: center.name, sapCode: center.sapCode, holdLocation };
}

/**
 * Keeps the branch sale this SC copy came from in step with the SC request: its return request
 * gets the same status, and its sale the matching ATR status. Older SC sales have no branch sale.
 */
async function syncBranchSale(
  tx: Tx,
  request: { tenantId: string; sale: { sourceBranchSale: { id: string } | null } },
  update: {
    status: ReturnRequestStatus;
    atrStatus?: AtrStatus;
    completedAt?: Date;
    evaluationNotes?: string;
  },
) {
  const branchSaleId = request.sale.sourceBranchSale?.id;
  if (!branchSaleId) return;
  await tx.branchReturnRequest.updateMany({
    where: { saleId: branchSaleId, tenantId: request.tenantId },
    data: {
      status: update.status,
      ...(update.completedAt ? { completedAt: update.completedAt } : {}),
      ...(update.evaluationNotes ? { evaluationNotes: update.evaluationNotes } : {}),
    },
  });
  if (update.atrStatus) {
    await tx.branchSalesTransaction.update({
      where: { id: branchSaleId },
      data: { atrStatus: update.atrStatus },
    });
  }
}

/**
 * The branch sale shows the new unit the way it shows its own replacements: a SalesReplacement
 * row on the same invoice, at the line's price (an SC replacement does not change the price).
 */
async function recordBranchSaleReplacement(
  tx: Tx,
  input: {
    request: ScServiceRequest;
    userId: string;
    originalSerialNumberId: string;
    replacementSerialNumberId: string;
    at: Date;
  },
) {
  const { request } = input;
  const branchSale = request.sale.sourceBranchSale;
  if (!branchSale) return;
  const line = await tx.branchSalesTransactionDetail.findFirst({
    where: { salesId: branchSale.id, serialNumberId: input.originalSerialNumberId },
    select: { modelPrice: true, saleAmount: true, amount: true },
  });
  const price = line?.modelPrice ?? line?.saleAmount ?? line?.amount ?? null;
  await tx.salesReplacement.create({
    data: {
      tenantId: request.tenantId,
      saleId: branchSale.id,
      replacementNo: await nextReplacementNo(request.tenantId, tx),
      originalSerialNumberId: input.originalSerialNumberId,
      originalModelPrice: price,
      originalInvoiceDate: request.sale.transactionDate,
      originalInvoiceNo: request.sale.transactionNo,
      replacementSerialNumberId: input.replacementSerialNumberId,
      replacementDealerId: branchSale.branch.dealerId ?? null,
      replacementAmount: price,
      replacementModelPrice: price,
      replacementInvoiceDate: request.sale.transactionDate ?? input.at,
      replacementInvoiceNo: request.sale.transactionNo,
      transactedById: input.userId,
      transactedAt: input.at,
    },
  });
}

/**
 * After a replacement, the new unit is the customer's: a new SC sale on the same transaction no.
 * holds it (open, Sold at the SC), so it can be returned or replaced again from the Service
 * Center tab. The finished sale keeps the returned unit for the record.
 */
async function createReplacementSale(
  tx: Tx,
  input: {
    request: ScServiceRequest;
    userId: string;
    originalLineId: string;
    replacement: { id: string; serialNo: string; model: { id: string; brandId: string | null } };
    sldCodeId: string;
  },
) {
  const { request, replacement } = input;
  const [header, line, unit] = await Promise.all([
    tx.serviceCenterSalesTransaction.findUniqueOrThrow({
      where: { id: request.sale.id },
      select: {
        packageTypeId: true,
        paymentTypeId: true,
        saleTypeId: true,
        promoTypeId: true,
        customerDeliveryMethodId: true,
        transactionDate: true,
        contactNo: true,
        siTrans: true,
        infoSlipVsoRrReleased: true,
        rrReceiveDeliver: true,
        proof: true,
        modelPrice: true,
        amount: true,
      },
    }),
    tx.serviceCenterSalesTransactionDetail.findUniqueOrThrow({
      where: { id: input.originalLineId },
      select: {
        packageTypeId: true,
        promoTypeId: true,
        deliveryNo: true,
        deliveryDate: true,
        modelPrice: true,
        saleAmount: true,
        amount: true,
      },
    }),
    tx.serviceCenterInventory.findFirst({
      where: { tenantId: request.tenantId, serviceCenterId: request.sale.serviceCenterId, serialNumberId: replacement.id },
      select: { serviceCenterLocationId: true },
    }),
  ]);
  const customerName = request.customerDealerBranch?.trim() || request.sale.customerName;
  return tx.serviceCenterSalesTransaction.create({
    data: {
      tenantId: request.tenantId,
      serviceCenterId: request.sale.serviceCenterId,
      serviceCenterLocationId: unit?.serviceCenterLocationId ?? null,
      packageTypeId: header.packageTypeId,
      paymentTypeId: header.paymentTypeId,
      saleTypeId: header.saleTypeId,
      promoTypeId: header.promoTypeId,
      customerDeliveryMethodId: header.customerDeliveryMethodId,
      transactionNo: request.sale.transactionNo,
      transactionDate: header.transactionDate,
      customerName,
      contactNo: header.contactNo,
      siTrans: header.siTrans,
      infoSlipVsoRrReleased: header.infoSlipVsoRrReleased,
      rrReceiveDeliver: header.rrReceiveDeliver,
      proof: header.proof,
      modelPrice: header.modelPrice,
      amount: header.amount,
      atrStatus: "open",
      notes: `Replacement unit ${replacement.serialNo} for ${request.sale.transactionNo} (request ${request.id})`,
      createdById: input.userId,
      details: {
        create: {
          packageTypeId: line.packageTypeId,
          brandId: replacement.model.brandId,
          promoTypeId: line.promoTypeId,
          modelId: replacement.model.id,
          serialNumberId: replacement.id,
          statusCodeId: input.sldCodeId,
          deliveryNo: line.deliveryNo,
          deliveryDate: line.deliveryDate,
          modelPrice: line.modelPrice,
          saleAmount: line.saleAmount,
          amount: line.amount,
        },
      },
    },
    select: { id: true },
  });
}

/** Rejected: the Reserve ODRF unit leaves the service center and is back at the branch sold. */
async function returnUnitToBranch(
  tx: Tx,
  input: {
    tenantId: string;
    userId: string;
    serviceCenterId: string;
    branchId: string;
    serialNumberId: string;
    odrfCodeId: string;
    priorCode: SoldCode;
    priorCodeId: string;
  },
) {
  const removed = await tx.serviceCenterInventory.deleteMany({
    where: {
      tenantId: input.tenantId,
      serviceCenterId: input.serviceCenterId,
      serialNumberId: input.serialNumberId,
      statusCodeId: input.odrfCodeId,
    },
  });
  if (removed.count !== 1) {
    throw new Error("The returned unit is no longer Reserve ODRF at this service center");
  }
  assertExclusivePlacement({
    placements: await loadCurrentPlacements(tx, [input.serialNumberId]),
    replacingIds: [],
  });
  await tx.branchInventory.create({
    data: {
      tenantId: input.tenantId,
      branchId: input.branchId,
      serialNumberId: input.serialNumberId,
      statusCodeId: input.priorCodeId,
      updatedById: input.userId,
      ...statusUpdatedStamp(RESERVE_ODRF_CODE, input.priorCode),
    },
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
    fromBranchSale: request.sale.sourceBranchSale != null,
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
    throw new Error("Only a Service Return or Service Replacement goes to a service center");
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
   * CSR, branch Sales: a Service Return / Replacement on a branch sale line, sent to the
   * service center the CSR chose. In one transaction:
   * - the branch sale gets its return request at `pending_sc` and goes to reserve;
   * - a copy of the sale (header plus the returned line) is saved at that service center;
   * - the unit leaves branch stock and becomes Reserve ODRF at the service center;
   * - the SC request on the copy waits at `pending_sc` for the service center.
   * The service center then finishes it in SC Returns; every decision updates the branch sale.
   */
  async requestFromBranchSale(
    requester: BranchServiceReturnRequester,
    input: { saleId: string; payload: ProcessReturnPayload },
  ): Promise<{ branchReturnRequestId: string; scReturnRequestId: string }> {
    const { tenantId, userId } = requester;
    const { payload } = input;
    const checked = await validateRequestInput(tenantId, payload);
    const center = await requireReceivingServiceCenter(tenantId, payload.serviceCenterId);

    const sale = await prisma.branchSalesTransaction.findFirst({
      where: { id: input.saleId, tenantId },
      select: {
        id: true,
        branchId: true,
        packageTypeId: true,
        paymentTypeId: true,
        saleTypeId: true,
        promoTypeId: true,
        customerDeliveryMethodId: true,
        transactionNo: true,
        transactionDate: true,
        customerName: true,
        contactNo: true,
        siTrans: true,
        infoSlipVsoRrReleased: true,
        rrReceiveDeliver: true,
        proof: true,
        atrStatus: true,
        notes: true,
        branch: { select: { name: true } },
        returnRequest: { select: { id: true } },
        serviceCenterCopy: { select: { id: true } },
        details: {
          select: {
            id: true,
            packageTypeId: true,
            brandId: true,
            promoTypeId: true,
            modelId: true,
            serialNumberId: true,
            statusCodeId: true,
            deliveryNo: true,
            deliveryDate: true,
            modelPrice: true,
            saleAmount: true,
            amount: true,
            model: { select: { skuCode: true, name: true } },
            serialNumber: { select: { serialNo: true } },
          },
        },
      },
    });
    if (!sale) throw new Error("Sale not found");
    if (sale.returnRequest || sale.serviceCenterCopy) throw new Error("Return already requested");
    if (sale.atrStatus !== "open") throw new Error("Sale is not eligible for return");
    const line = sale.details.find((detail) => detail.id === payload.saleDetailId);
    if (!line) throw new Error("Selected sale line does not belong to this transaction");
    if (!line.serialNumberId) throw new Error("Encode the serial number on this line before requesting a return");
    const serialNumberId = line.serialNumberId;
    const lineAmount = line.saleAmount ?? line.amount ?? line.modelPrice ?? 0;

    const odrfCodeId = await reasonStatusService.findCodeId(tenantId, "inventory_system", RESERVE_ODRF_CODE);
    if (!odrfCodeId) throw new Error("Status code not configured: inventory_system/ODRF");

    const actionLabel = payload.actionType === "replacement" ? "Replacement" : "Return";
    const summaryNote = `[${actionLabel} requested] ${checked.documentType.name} · ${payload.stockStatusCode} · ${checked.problemDescriptionText}`;
    const scName = scLabel(center);
    // The customer the CSR typed in Process Return (prefilled from the sale) is the one the
    // service center deals with, so the SC copy and the ATR/ODRF carry it.
    const customerName = payload.customerDealerBranch?.trim() || sale.customerName;
    const serviceFields = {
      actionType: payload.actionType,
      stockStatusCode: payload.stockStatusCode,
      documentTypeId: checked.documentType.id,
      problemDescriptionId: checked.problemDescriptionId,
      problemDescriptionText: checked.problemDescriptionText,
      classification: payload.classification?.trim() || null,
      serviceModelId: checked.serviceModel?.id ?? null,
      customerDealerBranch: payload.customerDealerBranch?.trim() || null,
      natureOfTransaction: payload.natureOfTransaction?.trim() || null,
      refContactPo: payload.refContactPo?.trim() || null,
      warehouseLocationId: checked.warehouseLocation?.id ?? null,
    };

    const created = await prisma.$transaction(async (tx) => {
      await lockSerialNumbers(tx, [serialNumberId]);
      const unit = await tx.branchInventory.findFirst({
        where: {
          tenantId,
          branchId: sale.branchId,
          serialNumberId,
          statusCode: { code: { in: [...SOLD_CODES] } },
        },
        select: { id: true, statusCode: { select: { code: true } } },
      });
      const priorCode = unit?.statusCode.code;
      if (!unit || !isSoldCode(priorCode)) {
        throw new Error(`${line.serialNumber?.serialNo ?? "This unit"} is not Sold at ${sale.branch.name}`);
      }
      // Claimed against the sold code just read, so a concurrent change fails here.
      const removed = await tx.branchInventory.deleteMany({
        where: { id: unit.id, statusCode: { code: priorCode } },
      });
      if (removed.count !== 1) throw new Error(STALE_REQUEST);
      await placeServiceCenterUnit(tx, {
        tenantId,
        serviceCenterId: center.id,
        serviceCenterLocationId: center.holdLocation.id,
        serialNumberId,
        statusCodeId: odrfCodeId,
      });

      const branchRequest = await tx.branchReturnRequest.create({
        data: {
          tenantId,
          saleId: sale.id,
          saleDetailId: line.id,
          status: "pending_sc",
          requestedById: userId,
          requestNotes: checked.problemDescriptionText,
          serviceCenterId: center.id,
          ...serviceFields,
        },
        select: { id: true },
      });
      await tx.branchSalesTransaction.update({
        where: { id: sale.id },
        data: { atrStatus: "reserve", notes: [sale.notes, summaryNote].filter(Boolean).join("\n") },
      });

      const copy = await tx.serviceCenterSalesTransaction.create({
        data: {
          tenantId,
          serviceCenterId: center.id,
          serviceCenterLocationId: center.holdLocation.id,
          sourceBranchSaleId: sale.id,
          packageTypeId: sale.packageTypeId,
          paymentTypeId: sale.paymentTypeId,
          saleTypeId: sale.saleTypeId,
          promoTypeId: sale.promoTypeId,
          customerDeliveryMethodId: sale.customerDeliveryMethodId,
          transactionNo: sale.transactionNo,
          transactionDate: sale.transactionDate,
          customerName,
          contactNo: sale.contactNo,
          siTrans: sale.siTrans,
          infoSlipVsoRrReleased: sale.infoSlipVsoRrReleased,
          rrReceiveDeliver: sale.rrReceiveDeliver,
          proof: sale.proof,
          modelPrice: line.modelPrice,
          amount: lineAmount,
          atrStatus: "reserve",
          notes: `Copy of branch sale ${sale.transactionNo} (${sale.branch.name})\n${summaryNote}`,
          createdById: userId,
          details: {
            create: {
              packageTypeId: line.packageTypeId,
              brandId: line.brandId,
              promoTypeId: line.promoTypeId,
              modelId: line.modelId,
              serialNumberId,
              statusCodeId: line.statusCodeId,
              deliveryNo: line.deliveryNo,
              deliveryDate: line.deliveryDate,
              modelPrice: line.modelPrice,
              saleAmount: line.saleAmount,
              amount: line.amount,
            },
          },
        },
        select: { id: true, details: { select: { id: true } } },
      });
      const copyLine = copy.details[0];
      if (!copyLine) throw new Error("Could not copy the sale line to the service center");

      const scRequest = await tx.serviceCenterReturnRequest.create({
        data: {
          tenantId,
          saleId: copy.id,
          saleDetailId: copyLine.id,
          status: "pending_sc",
          requestedById: userId,
          priorStatusCode: priorCode,
          requestNotes: summaryNote,
          ...serviceFields,
        },
        select: { id: true, tenantId: true, createdAt: true },
      });
      const requestedContext =
        payload.actionType === "replacement"
          ? replacementContextRecord({
              transactionNo: sale.transactionNo,
              transactionDate: sale.transactionDate,
              transactionAmount: lineAmount,
              customerName: sale.customerName,
              customerNumber: sale.contactNo,
              returnedSerialNo: line.serialNumber?.serialNo,
            })
          : null;
      await tx.serialNumberHistory.create({
        data: {
          tenantId,
          serialNumberId,
          txnType: payload.actionType === "replacement" ? "replacement" : "return",
          details: `Service ${actionLabel.toLowerCase()} requested on ${sale.transactionNo} at ${sale.branch.name} · sent to ${scName} / ${center.holdLocation.code} · was ${priorCode} (request ${scRequest.id})`,
          status: RESERVE_ODRF_STATUS.name,
          createdById: userId,
          ...(requestedContext ? { context: requestedContext } : {}),
        },
      });
      await recordReturnRequested(
        tx,
        approvalRef(scRequest, sale.transactionNo, serialNumberId),
        { requestedById: userId, problemDescription: checked.problemDescriptionText },
        "INSPECTION",
      );
      return { branchRequestId: branchRequest.id, scRequestId: scRequest.id, createdAt: scRequest.createdAt };
    });

    // Best effort: the request stands even when the PDF cannot be stored.
    try {
      const path = await generateAndStoreAtrOdrfPdf({
        tenantId,
        returnRequestId: created.scRequestId,
        data: {
          documentTitle: "ATR / ODRF",
          actionTypeLabel: actionLabel,
          transactionNo: sale.transactionNo,
          transactionDate: sale.transactionDate ? sale.transactionDate.toLocaleDateString() : null,
          branchName: sale.branch.name,
          customerName,
          documentTypeName: checked.documentType.name,
          stockStatusCode: payload.stockStatusCode,
          problemDescriptionText: checked.problemDescriptionText,
          requestedByName: requester.name,
          requestedAt: created.createdAt.toLocaleString(),
          serviceCenterName: scName,
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
              saleAmount: lineAmount.toString(),
            },
          ],
        },
      });
      // Both requests point at the same PDF: branch Returns and SC Returns each offer it.
      await prisma.$transaction([
        prisma.serviceCenterReturnRequest.update({
          where: { id: created.scRequestId },
          data: { atrOdrfPdfPath: path },
        }),
        prisma.branchReturnRequest.update({
          where: { id: created.branchRequestId },
          data: { atrOdrfPdfPath: path },
        }),
      ]);
    } catch (error) {
      logger.warn({ tenantId, returnRequestId: created.scRequestId, err: error }, "sc service return ATR/ODRF PDF failed");
    }

    await auditService.log({
      tenantId,
      userId,
      action: "sale.service_return_sent_to_sc",
      entityType: "BranchSalesTransaction",
      entityId: sale.id,
      metadata: {
        transactionNo: sale.transactionNo,
        returnRequestId: created.branchRequestId,
        scReturnRequestId: created.scRequestId,
        serviceCenterId: center.id,
        actionType: payload.actionType,
        stockStatusCode: payload.stockStatusCode,
        documentTypeId: checked.documentType.id,
        saleDetailId: line.id,
      },
    });
    await notifyScServiceReturnRequested({
      tenantId,
      actorUserId: userId,
      returnRequestId: created.scRequestId,
      serviceCenterId: center.id,
      transactionNo: sale.transactionNo,
      actionType: payload.actionType,
      serialNo: line.serialNumber?.serialNo ?? null,
    });
    return { branchReturnRequestId: created.branchRequestId, scReturnRequestId: created.scRequestId };
  },

  /**
   * CSR, Sales → Service Center tab: a Service Return / Replacement on an open SC sale, such as
   * the sale an earlier replacement created for the new unit. The unit is already at that
   * service center, so it only becomes Reserve ODRF there; the same service center finishes it.
   */
  async requestOnScSale(
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
    const lineAmount = line.saleAmount ?? line.amount ?? 0;

    const odrfCodeId = await reasonStatusService.findCodeId(actor.tenantId, "inventory_system", RESERVE_ODRF_CODE);
    if (!odrfCodeId) throw new Error("Status code not configured: inventory_system/ODRF");

    const actionLabel = payload.actionType === "replacement" ? "Replacement" : "Return";
    const summaryNote = `[${actionLabel} requested] ${checked.documentType.name} · ${payload.stockStatusCode} · ${checked.problemDescriptionText}`;
    const scName = scLabel(sale.serviceCenter);
    const customerName = payload.customerDealerBranch?.trim() || sale.customerName;

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
      // Claimed against the sold code just read, so a concurrent change fails here.
      const held = await tx.serviceCenterInventory.updateMany({
        where: { id: unit.id, statusCode: { code: priorCode } },
        data: { statusCodeId: odrfCodeId },
      });
      if (held.count !== 1) throw new Error(STALE_REQUEST);

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
      await tx.serviceCenterSalesTransaction.update({
        where: { id: sale.id },
        data: { atrStatus: "reserve", notes: [sale.notes, summaryNote].filter(Boolean).join("\n") },
      });
      await tx.serialNumberHistory.create({
        data: {
          tenantId: actor.tenantId,
          serialNumberId,
          txnType: payload.actionType === "replacement" ? "replacement" : "return",
          details: `Service ${actionLabel.toLowerCase()} requested on ${sale.transactionNo} at ${scName} · was ${priorCode} (request ${request.id})`,
          status: RESERVE_ODRF_STATUS.name,
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
          customerName,
          documentTypeName: checked.documentType.name,
          stockStatusCode: payload.stockStatusCode,
          problemDescriptionText: checked.problemDescriptionText,
          requestedByName: input.requesterName,
          requestedAt: created.createdAt.toLocaleString(),
          serviceCenterName: scName,
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
              saleAmount: lineAmount.toString(),
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
      await syncBranchSale(tx, request, { status: "completed", atrStatus: "closed", completedAt: now });
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

    const instructions = await specialInstructionsForUnits(
      request.sale.serviceCenterId,
      serials.map((row) => row.serialNumberId),
    );

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
        specialInstructions: instructions.get(row.serialNumberId) ?? null,
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
    const created = await prisma.$transaction(async (tx) => {
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
      await syncBranchSale(tx, request, { status: "completed", atrStatus: "closed", completedAt: now });
      await recordBranchSaleReplacement(tx, {
        request,
        userId: actor.userId,
        originalSerialNumberId: line.serialNumberId,
        replacementSerialNumberId: replacement.id,
        at: now,
      });
      const replacementSale = await createReplacementSale(tx, {
        request,
        userId: actor.userId,
        originalLineId: line.id,
        replacement,
        sldCodeId,
      });

      const replacementContext = replacementContextForRequest(request, {
        returnedSerialNo: line.serialNumber?.serialNo,
        replacedSerialNo: replacement.serialNo,
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
            context: replacementContext,
          },
          {
            tenantId: actor.tenantId,
            serialNumberId: replacement.id,
            txnType: "replacement",
            details: `Service replacement from ${scName} sold on same invoice ${request.sale.transactionNo}`,
            status: "SLD",
            createdById: actor.userId,
            createdAt: now,
            context: replacementContext,
          },
        ],
      });
      await recordServiceInspectionDecided(tx, approvalRef(request, request.sale.transactionNo, line.serialNumberId), {
        status: "APPROVED",
        decidedById: actor.userId,
      });
      return { replacementSaleId: replacementSale.id };
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
        replacementSaleId: created.replacementSaleId,
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

    const linked = await prisma.$transaction(async (tx) => {
      const claimed = await tx.serviceCenterReturnRequest.updateMany({
        where: { id: request.id, status: "pending_sc", specialOrderId: null },
        data: { status: "awaiting_stock", specialOrderId: order.id },
      });
      if (claimed.count === 1) await syncBranchSale(tx, request, { status: "awaiting_stock" });
      return claimed;
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
      const branchSale = request.sale.sourceBranchSale;
      if (branchSale) {
        await returnUnitToBranch(tx, {
          tenantId: actor.tenantId,
          userId: actor.userId,
          serviceCenterId: request.sale.serviceCenterId,
          branchId: branchSale.branchId,
          serialNumberId: line.serialNumberId,
          odrfCodeId,
          priorCode,
          priorCodeId,
        });
      } else {
        await tx.serviceCenterInventory.updateMany({
          where: {
            tenantId: actor.tenantId,
            serviceCenterId: request.sale.serviceCenterId,
            serialNumberId: line.serialNumberId,
            statusCodeId: odrfCodeId,
          },
          data: { statusCodeId: priorCodeId },
        });
      }
      // The copy closes: the sale reopens on the branch, where a new request would start.
      await tx.serviceCenterSalesTransaction.update({
        where: { id: request.sale.id },
        data: { atrStatus: branchSale ? "closed" : "open" },
      });
      await syncBranchSale(tx, request, { status: "rejected", atrStatus: "open", evaluationNotes: reason });
      await releaseHeldUnit(tx, { tenantId: actor.tenantId, serialNumberId: request.heldSerialNumberId, rsvCodeId, stkCodeId });
      const rejectedContext =
        actionOf(request) === "replacement"
          ? replacementContextForRequest(request, {
              returnedSerialNo: line.serialNumber?.serialNo,
            })
          : null;
      await tx.serialNumberHistory.create({
        data: {
          tenantId: actor.tenantId,
          serialNumberId: line.serialNumberId,
          txnType: actionOf(request) === "replacement" ? "replacement" : "return",
          details: `Service request rejected on ${request.sale.transactionNo}: ${reason}${request.sale.sourceBranchSale ? ` · back to ${request.sale.sourceBranchSale.branch.name}` : ""} (request ${request.id})`,
          status: priorCode,
          createdById: actor.userId,
          ...(rejectedContext ? { context: rejectedContext } : {}),
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
      sale: {
        select: { transactionNo: true, serviceCenterId: true, sourceBranchSale: { select: { id: true } } },
      },
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
  await syncBranchSale(tx, { tenantId: input.tenantId, sale: request.sale }, { status: "pending_sc" });
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
    select: {
      id: true,
      sale: {
        select: { transactionNo: true, serviceCenterId: true, sourceBranchSale: { select: { id: true } } },
      },
    },
  });
  if (!request) return null;
  await tx.serviceCenterReturnRequest.update({
    where: { id: request.id },
    data: { status: "pending_sc", specialOrderId: null },
  });
  await syncBranchSale(tx, { tenantId: input.tenantId, sale: request.sale }, { status: "pending_sc" });
  return {
    returnRequestId: request.id,
    serviceCenterId: request.sale.serviceCenterId,
    transactionNo: request.sale.transactionNo,
  };
}
