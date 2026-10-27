import { Prisma } from "@/lib/database/generated/prisma/client";
import {
  loadCurrentPlacements,
  lockSerialNumbers,
  lockSerialRegistrations,
} from "@/features/inventory/services/serial-placement";
import { lockDeliveryRow, txWorkflowCodeId } from "@/features/logistics/services/delivery-settle";
import {
  checkFollowedDocument,
  deliveryStatusAfterFollow,
  parseFollowedDocument,
  placementsToReplace,
  SAP_FOLLOW_STATUS,
  type FollowedDocKind,
  type FollowedDocument,
  type SapFollowStatus,
} from "@/features/logistics/services/sap-copy-to-follow.planner";
import type { OrderSapDocType } from "@/features/orders/constants/order-sap-doc-type";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import { sapSyncCursorRepository } from "@/features/sap/repositories/sap-sync-cursor.repository";
import { sapErrorMessage, sapPageSize } from "@/features/sap/services/sap-master-data";
import { sapServiceLayerClient } from "@/features/sap/services/sap-service-layer-client";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";
import { withSapSyncLock } from "@/features/sap/services/sap-sync-lock";
import type { SapServiceLayerCredentials } from "@/features/sap/types/sap-service-layer";
import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/shared/logger";

/**
 * The cron follow-up for SAP Copy To (see docs/sap-copy-to-follow-plan.md).
 *
 * After Supply Planning approves an order, ISMS posts its ITR or SO. A SAP user then
 * copies it to an IT or DR in SAP. Each run asks SAP only for IT/DR documents newer than
 * the last one it saw that carry an ISMS order number, keeps those that belong to an open
 * ISMS delivery, reads just those in full, and applies each one: its serials become DIT
 * at the delivery's branch, where the branch accepts them as before.
 *
 * Kept light on purpose: two small list calls per run when nothing happened, one read per
 * document someone actually made, one short transaction per document.
 */

/** How long one run may spend before it stops; the next tick continues from the cursor. */
const DEFAULT_BUDGET_MS = 60_000;
/** A FAILED document is retried this many times, then left for a person. */
const MAX_ATTEMPTS = 10;
/** FAILED documents retried per run, so a backlog of bad documents cannot crowd out new ones. */
const RETRIES_PER_RUN = 20;
/** Delivery statuses a Copy To document may still land on. */
const OPEN_DELIVERY_CODES = ["approved", "pending", "partial", "accepted"];

const SOURCES: Record<
  FollowedDocKind,
  { entity: string; select: string; cursor: string }
> = {
  IT: {
    entity: "StockTransfers",
    select: "DocEntry,DocNum,DocDate,U_ISMS_PO_No,ToWarehouse,StockTransferLines",
    cursor: "copy-to-follow:it",
  },
  DR: {
    entity: "DeliveryNotes",
    select: "DocEntry,DocNum,DocDate,U_ISMS_PO_No,U_DR_NUMBER,Cancelled,CancelStatus,DocumentLines",
    cursor: "copy-to-follow:dr",
  },
};

/** A document that cannot be applied, with how to record it. */
class FollowError extends Error {
  constructor(
    readonly status: Exclude<SapFollowStatus, "APPLIED">,
    message: string,
  ) {
    super(message);
    this.name = "FollowError";
  }
}

export interface SapCopyToFollowResult {
  applied: number;
  failed: number;
  flagged: number;
  /** Documents SAP listed since the last run, ISMS's or not. */
  scanned: number;
}

interface OpenDelivery {
  id: string;
  orderNumber: string;
  sapDocType: OrderSapDocType;
  sapDocEntry: number;
}

interface ListedDocument {
  docEntry: number;
  ismsRef: string;
}

interface InventoryCodes {
  dit: string;
  stk: string;
}

// ---- SAP reads ------------------------------------------------------------------------

async function sapGet<T>(creds: SapServiceLayerCredentials, path: string, entity: string) {
  const response = await sapServiceLayerClient.request<T>({
    creds,
    method: "GET",
    path,
    headers: { Prefer: `odata.maxpagesize=${sapPageSize()}` },
  });
  if (response.statusCode >= 400) {
    throw new Error(sapErrorMessage(response.statusCode, response.rawBody, entity));
  }
  return response.data;
}

/**
 * One page of documents newer than `afterDocEntry` that carry an ISMS order number, in
 * DocEntry order. DocEntry only grows, so it is a reliable high-water mark. The first run
 * has no mark yet and starts from `sinceDate` instead.
 */
async function listPage(
  creds: SapServiceLayerCredentials,
  kind: FollowedDocKind,
  position: { afterDocEntry: number | null; sinceDate: string | null },
): Promise<ListedDocument[]> {
  const { entity } = SOURCES[kind];
  const clauses = ["U_ISMS_PO_No ne null"];
  if (position.afterDocEntry != null) clauses.push(`DocEntry gt ${position.afterDocEntry}`);
  else if (position.sinceDate) clauses.push(`DocDate ge '${position.sinceDate}'`);
  const filter = encodeURIComponent(clauses.join(" and "));
  const data = await sapGet<{ value?: Record<string, unknown>[] }>(
    creds,
    `/${entity}?$filter=${filter}&$select=DocEntry,U_ISMS_PO_No&$orderby=DocEntry`,
    entity,
  );
  return (data?.value ?? []).flatMap((row) => {
    const docEntry = Number(row.DocEntry);
    return Number.isInteger(docEntry)
      ? [{ docEntry, ismsRef: String(row.U_ISMS_PO_No ?? "").trim() }]
      : [];
  });
}

async function readDocument(
  creds: SapServiceLayerCredentials,
  kind: FollowedDocKind,
  docEntry: number,
): Promise<FollowedDocument> {
  const { entity, select } = SOURCES[kind];
  const raw = await sapGet<Record<string, unknown>>(
    creds,
    `/${entity}(${docEntry})?$select=${select}`,
    entity,
  );
  const parsed = parseFollowedDocument(kind, raw ?? {});
  if ("error" in parsed) throw new FollowError(SAP_FOLLOW_STATUS.FAILED, parsed.error);
  return parsed;
}

// ---- ISMS lookups ---------------------------------------------------------------------

/** Open deliveries whose order number is among `refs` and whose ITR/SO SAP posted. */
async function openDeliveriesByOrderNumber(
  tenantId: string,
  refs: string[],
): Promise<Map<string, OpenDelivery>> {
  if (refs.length === 0) return new Map();
  const rows = await prisma.branchDelivery.findMany({
    where: {
      tenantId,
      statusCode: { code: { in: OPEN_DELIVERY_CODES } },
      order: { orderNumber: { in: refs }, sapDocType: { not: null }, sapDocEntry: { not: null } },
    },
    select: {
      id: true,
      order: { select: { orderNumber: true, sapDocType: true, sapDocEntry: true } },
    },
  });
  const byRef = new Map<string, OpenDelivery>();
  for (const row of rows) {
    if (!row.order?.sapDocType || row.order.sapDocEntry == null) continue;
    byRef.set(row.order.orderNumber, {
      id: row.id,
      orderNumber: row.order.orderNumber,
      sapDocType: row.order.sapDocType,
      sapDocEntry: row.order.sapDocEntry,
    });
  }
  return byRef;
}

/** First run only: start a day before the oldest delivery still waiting on SAP. */
async function firstRunSinceDate(tenantId: string): Promise<string | null> {
  const oldest = await prisma.branchDelivery.findFirst({
    where: {
      tenantId,
      statusCode: { code: { in: OPEN_DELIVERY_CODES } },
      order: { sapDocEntry: { not: null } },
    },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  if (!oldest) return null;
  const since = new Date(oldest.createdAt.getTime() - 24 * 60 * 60 * 1000);
  return since.toISOString().slice(0, 10);
}

// ---- Recording ------------------------------------------------------------------------

/**
 * Record a document that did not apply. Never downgrades one already APPLIED (another
 * run may have applied it in the meantime).
 */
async function recordNotApplied(
  tenantId: string,
  deliveryId: string,
  doc: Pick<FollowedDocument, "kind" | "docEntry" | "docNum" | "displayNo" | "docDate">,
  status: Exclude<SapFollowStatus, "APPLIED">,
  error: string,
): Promise<void> {
  const where = { tenantId, docKind: doc.kind, docEntry: doc.docEntry };
  const updated = await prisma.deliverySapDocument.updateMany({
    where: { ...where, status: { not: SAP_FOLLOW_STATUS.APPLIED } },
    data: { status, error: error.slice(0, 500), attempts: { increment: 1 } },
  });
  if (updated.count > 0) return;
  try {
    await prisma.deliverySapDocument.create({
      data: {
        ...where,
        deliveryId,
        docNum: doc.docNum,
        displayNo: doc.displayNo,
        docDate: doc.docDate ? new Date(doc.docDate) : null,
        status,
        error: error.slice(0, 500),
      },
    });
  } catch (e) {
    // Created by a concurrent run, or already APPLIED: nothing more to record.
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
  }
}

// ---- Applying one document ------------------------------------------------------------

/**
 * Serial ids for the document's serials, registering any ISMS has not synced yet from
 * the line's item (as the serial sync would). A soft-deleted serial is restored.
 */
async function resolveSerials(
  tx: Prisma.TransactionClient,
  tenantId: string,
  doc: FollowedDocument,
  serialNos: string[],
): Promise<Map<string, string>> {
  const existing = await tx.serialNumber.findMany({
    where: { tenantId, serialNo: { in: serialNos } },
    select: { id: true, serialNo: true, deletedAt: true },
  });
  const restored = existing.filter((row) => row.deletedAt !== null).map((row) => row.id);
  if (restored.length > 0) {
    await tx.serialNumber.updateMany({
      where: { id: { in: restored } },
      data: { deletedAt: null, recordStatus: "active" },
    });
  }

  const idBySerial = new Map(existing.map((row) => [row.serialNo, row.id]));
  const missing = serialNos.filter((serialNo) => !idBySerial.has(serialNo));
  if (missing.length === 0) return idBySerial;

  const itemBySerial = new Map<string, string>();
  for (const line of doc.lines) {
    for (const serialNo of line.serialNos) itemBySerial.set(serialNo, line.itemCode);
  }
  const itemCodes = [...new Set(missing.map((serialNo) => itemBySerial.get(serialNo) ?? ""))];
  const models = await tx.productModel.findMany({
    where: { tenantId, deletedAt: null, skuCode: { in: itemCodes } },
    select: { id: true, skuCode: true },
  });
  const modelBySku = new Map(models.map((model) => [model.skuCode, model.id]));
  const unknownItems = itemCodes.filter((code) => !modelBySku.has(code));
  if (unknownItems.length > 0) {
    throw new FollowError(
      SAP_FOLLOW_STATUS.FAILED,
      `Item ${unknownItems.join(", ")} is not in ISMS. Sync Models from SAP; the document is retried.`,
    );
  }

  await lockSerialRegistrations(tx, missing.map((serialNo) => ({ tenantId, serialNo })));
  await tx.serialNumber.createMany({
    data: missing.map((serialNo) => ({
      tenantId,
      serialNo,
      modelId: modelBySku.get(itemBySerial.get(serialNo) ?? "") ?? "",
    })),
    skipDuplicates: true,
  });
  const created = await tx.serialNumber.findMany({
    where: { tenantId, serialNo: { in: missing } },
    select: { id: true, serialNo: true },
  });
  for (const row of created) idBySerial.set(row.serialNo, row.id);
  return idBySerial;
}

async function applyDocument(
  tenantId: string,
  deliveryId: string,
  doc: FollowedDocument,
  serialNos: string[],
  codes: InventoryCodes,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockDeliveryRow(tx, tenantId, deliveryId);
    const delivery = await tx.branchDelivery.findFirst({
      where: { id: deliveryId, tenantId },
      select: {
        branchId: true,
        deliveryNo: true,
        sapDocEntry: true,
        statusCode: { select: { code: true } },
        lines: { select: { serialNumberId: true } },
      },
    });
    if (!delivery) throw new FollowError(SAP_FOLLOW_STATUS.FLAGGED, "Delivery not found");
    const nextStatus = deliveryStatusAfterFollow(delivery.statusCode.code);
    if (!nextStatus) {
      throw new FollowError(
        SAP_FOLLOW_STATUS.FLAGGED,
        `Delivery ${delivery.deliveryNo} is ${delivery.statusCode.code}, so ${doc.kind} ${doc.displayNo} was not applied`,
      );
    }

    const idBySerial = await resolveSerials(tx, tenantId, doc, serialNos);
    const onDelivery = new Set(delivery.lines.map((line) => line.serialNumberId));
    // A serial already on this delivery (an earlier, overlapping document) is not moved again.
    const serialIds = [...idBySerial.values()].filter((id) => !onDelivery.has(id));
    await lockSerialNumbers(tx, serialIds);

    const placements = (await loadCurrentPlacements(tx, serialIds)).filter(
      (row) => row.tenantId === tenantId,
    );
    const { replaceIds, blocked } = placementsToReplace(placements);
    if (blocked.length > 0) {
      throw new FollowError(
        SAP_FOLLOW_STATUS.FAILED,
        blocked.map((row) => `${row.serialNo} is at ${row.place} in ISMS`).join("; "),
      );
    }
    const replacing = placements.filter((row) => replaceIds.includes(row.id));
    const warehouseRows = replacing.filter((row) => row.table === "warehouse");
    const branchRows = replacing.filter((row) => row.table === "branch");
    const fromLocation = new Map(warehouseRows.map((row) => [row.serialNumberId, row.warehouseLocationId]));
    const withBranchRow = new Set(branchRows.map((row) => row.serialNumberId));

    if (warehouseRows.length > 0) {
      await tx.warehouseInventory.deleteMany({ where: { id: { in: warehouseRows.map((row) => row.id) } } });
    }
    if (branchRows.length > 0) {
      const moved = await tx.branchInventory.updateMany({
        where: { id: { in: branchRows.map((row) => row.id) }, statusCodeId: codes.stk },
        data: { branchId: delivery.branchId, statusCodeId: codes.dit, warehouseLocationId: null },
      });
      if (moved.count !== branchRows.length) {
        throw new FollowError(
          SAP_FOLLOW_STATUS.FAILED,
          "A serial changed in ISMS while this was applied; it is retried on the next run",
        );
      }
    }
    const inserts = serialIds.filter((id) => !withBranchRow.has(id));
    if (inserts.length > 0) {
      await tx.branchInventory.createMany({
        data: inserts.map((serialNumberId) => ({
          tenantId,
          branchId: delivery.branchId,
          serialNumberId,
          statusCodeId: codes.dit,
        })),
      });
    }

    if (serialIds.length > 0) {
      await tx.branchDeliveryLine.createMany({
        data: serialIds.map((serialNumberId) => ({
          deliveryId,
          serialNumberId,
          warehouseLocationFromId: fromLocation.get(serialNumberId) ?? null,
        })),
        skipDuplicates: true,
      });
      await tx.serialNumberHistory.createMany({
        data: serialIds.map((serialNumberId) => ({
          tenantId,
          serialNumberId,
          txnType: "delivery" as const,
          details: `Dispatched in SAP on ${doc.kind} ${doc.displayNo} for ${delivery.deliveryNo}`,
          status: "DIT",
        })),
      });
      // SAP moved the serial: into the branch's warehouse (IT) or out to the dealer (DR).
      await tx.serialNumber.updateMany({
        where: { id: { in: serialIds } },
        data:
          doc.kind === "IT" && doc.toWarehouse
            ? { sapWhsCode: doc.toWarehouse, sapOnHand: true, sapOnHandSyncedAt: new Date() }
            : { sapWhsCode: null, sapOnHand: false, sapOnHandSyncedAt: new Date() },
      });
    }

    const nextStatusId = await txWorkflowCodeId(tx, tenantId, nextStatus);
    await tx.branchDelivery.update({
      where: { id: deliveryId },
      data: {
        statusCodeId: nextStatusId,
        // The first document is the delivery's SAP reference; returns post against it.
        ...(delivery.sapDocEntry == null
          ? {
              sapDocEntry: doc.docEntry,
              drNo: doc.displayNo,
              drDate: doc.docDate ? new Date(doc.docDate) : null,
            }
          : {}),
      },
    });

    const record = {
      deliveryId,
      docNum: doc.docNum,
      displayNo: doc.displayNo,
      docDate: doc.docDate ? new Date(doc.docDate) : null,
      status: SAP_FOLLOW_STATUS.APPLIED,
      serialCount: serialIds.length,
      error: null,
    };
    await tx.deliverySapDocument.upsert({
      where: { tenantId_docKind_docEntry: { tenantId, docKind: doc.kind, docEntry: doc.docEntry } },
      create: { tenantId, docKind: doc.kind, docEntry: doc.docEntry, ...record },
      update: { ...record, attempts: { increment: 1 } },
    });

    await tx.auditLog.create({
      data: {
        tenantId,
        userId: null,
        action: "delivery.dispatched_in_sap",
        entityType: "BranchDelivery",
        entityId: deliveryId,
        metadata: {
          docKind: doc.kind,
          docEntry: doc.docEntry,
          displayNo: doc.displayNo,
          serialNumberIds: serialIds,
          status: nextStatus,
        },
      },
    });
  });
}

/** Read, check and apply one document, recording the outcome either way. */
async function followDocument(
  creds: SapServiceLayerCredentials,
  tenantId: string,
  kind: FollowedDocKind,
  docEntry: number,
  delivery: OpenDelivery,
  codes: InventoryCodes,
  result: SapCopyToFollowResult,
): Promise<void> {
  let doc: FollowedDocument | null = null;
  try {
    doc = await readDocument(creds, kind, docEntry);
    const check = checkFollowedDocument(doc, delivery);
    if (!check.ok) throw new FollowError(check.status, check.reason);
    await applyDocument(tenantId, delivery.id, doc, check.serialNos, codes);
    result.applied += 1;
  } catch (e) {
    const status = e instanceof FollowError ? e.status : SAP_FOLLOW_STATUS.FAILED;
    const message = e instanceof Error ? e.message : "Unknown error";
    if (status === SAP_FOLLOW_STATUS.FLAGGED) result.flagged += 1;
    else result.failed += 1;
    logger.warn(
      { tenantId, kind, docEntry, deliveryId: delivery.id, status, err: message },
      "sap copy-to follow: document not applied",
    );
    await recordNotApplied(
      tenantId,
      delivery.id,
      doc ?? { kind, docEntry, docNum: 0, displayNo: String(docEntry), docDate: null },
      status,
      message,
    );
  }
}

// ---- One run --------------------------------------------------------------------------

async function followNewDocuments(
  creds: SapServiceLayerCredentials,
  tenantId: string,
  kind: FollowedDocKind,
  codes: InventoryCodes,
  deadline: number,
  result: SapCopyToFollowResult,
): Promise<void> {
  const source = SOURCES[kind];
  const cursor = await sapSyncCursorRepository.get(tenantId, source.cursor);
  const stored = cursor.lastKey ? Number.parseInt(cursor.lastKey, 10) : Number.NaN;
  let afterDocEntry = Number.isInteger(stored) ? stored : null;
  const sinceDate = afterDocEntry == null ? await firstRunSinceDate(tenantId) : null;
  // Nothing has ever waited on SAP: no mark to start from and nothing to follow.
  if (afterDocEntry == null && sinceDate == null) return;

  while (Date.now() < deadline) {
    const page = await listPage(creds, kind, { afterDocEntry, sinceDate });
    if (page.length === 0) return;
    result.scanned += page.length;

    const deliveries = await openDeliveriesByOrderNumber(tenantId, [
      ...new Set(page.map((row) => row.ismsRef)),
    ]);
    const matched = page.filter((row) => deliveries.has(row.ismsRef));
    if (matched.length > 0) {
      const known = await prisma.deliverySapDocument.findMany({
        where: { tenantId, docKind: kind, docEntry: { in: matched.map((row) => row.docEntry) } },
        select: { docEntry: true },
      });
      const seen = new Set(known.map((row) => row.docEntry));
      for (const row of matched) {
        const delivery = deliveries.get(row.ismsRef);
        if (!delivery || seen.has(row.docEntry)) continue;
        await followDocument(creds, tenantId, kind, row.docEntry, delivery, codes, result);
      }
    }

    afterDocEntry = page[page.length - 1].docEntry;
    // Saved per page: an interrupted run re-reads at most one page, never applies twice.
    await sapSyncCursorRepository.advance(tenantId, source.cursor, String(afterDocEntry), 0);
  }
}

/** Retry documents that failed before (a model not synced yet, a row changed mid-apply). */
async function retryFailed(
  creds: SapServiceLayerCredentials,
  tenantId: string,
  codes: InventoryCodes,
  deadline: number,
  result: SapCopyToFollowResult,
): Promise<void> {
  const failed = await prisma.deliverySapDocument.findMany({
    where: { tenantId, status: SAP_FOLLOW_STATUS.FAILED, attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { updatedAt: "asc" },
    take: RETRIES_PER_RUN,
    select: {
      docKind: true,
      docEntry: true,
      delivery: {
        select: {
          id: true,
          order: { select: { orderNumber: true, sapDocType: true, sapDocEntry: true } },
        },
      },
    },
  });
  for (const row of failed) {
    if (Date.now() >= deadline) return;
    const order = row.delivery.order;
    if (!order?.sapDocType || order.sapDocEntry == null) continue;
    await followDocument(
      creds,
      tenantId,
      row.docKind === "DR" ? "DR" : "IT",
      row.docEntry,
      {
        id: row.delivery.id,
        orderNumber: order.orderNumber,
        sapDocType: order.sapDocType,
        sapDocEntry: order.sapDocEntry,
      },
      codes,
      result,
    );
  }
}

/**
 * Follow up Copy To documents for one tenant. Does nothing when SAP is not configured.
 * Locked per tenant, so overlapping cron ticks join the run in flight.
 */
export function runSapCopyToFollow(
  tenantId: string,
  options?: { budgetMs?: number },
): Promise<SapCopyToFollowResult> {
  return withSapSyncLock(`copy-to-follow:${tenantId}`, async () => {
    const result: SapCopyToFollowResult = { applied: 0, failed: 0, flagged: 0, scanned: 0 };
    const creds = await sapServiceLayerService.getCredentials(tenantId);
    if (!creds) return result;

    const deadline = Date.now() + (options?.budgetMs ?? DEFAULT_BUDGET_MS);
    const [dit, stk] = await Promise.all([
      reasonStatusService.requireCodeId(tenantId, "inventory_system", "DIT"),
      reasonStatusService.requireCodeId(tenantId, "inventory_system", "STK"),
    ]);
    const codes = { dit, stk };

    await retryFailed(creds, tenantId, codes, deadline, result);
    for (const kind of ["IT", "DR"] as const) {
      try {
        await followNewDocuments(creds, tenantId, kind, codes, deadline, result);
      } catch (e) {
        // One document type's read failing (SAP down mid-run) must not stop the other.
        const message = e instanceof Error ? e.message : "Unknown error";
        await sapSyncCursorRepository.recordError(tenantId, SOURCES[kind].cursor, message);
        logger.error({ tenantId, kind, err: message }, "sap copy-to follow: listing failed");
      }
    }

    if (result.applied + result.failed + result.flagged > 0) {
      logger.info({ tenantId, ...result }, "sap copy-to follow finished");
    }
    return result;
  });
}
