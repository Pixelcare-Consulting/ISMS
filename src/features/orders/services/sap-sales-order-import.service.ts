import { Prisma } from "@/lib/database/generated/prisma/client";
import { auditService } from "@/features/audit/services/audit.service";
import { DELIVERY_WORKFLOW_CODE } from "@/features/logistics/constants/workflow-codes";
import { logisticsService } from "@/features/logistics/services/logistics.service";
import {
  parseSapSalesOrder,
  planSapSalesOrderImport,
  sapSalesOrderNumber,
  type SapSalesOrder,
  type SapSalesOrderImportPlan,
  type SapSalesOrderLookups,
} from "@/features/orders/services/sap-sales-order-import.planner";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import { sapSyncCursorRepository } from "@/features/sap/repositories/sap-sync-cursor.repository";
import { sapErrorMessage, sapPageSize } from "@/features/sap/services/sap-master-data";
import { sapServiceLayerClient } from "@/features/sap/services/sap-service-layer-client";
import type { SapServiceLayerCredentials } from "@/features/sap/types/sap-service-layer";
import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/shared/logger";

/**
 * Imports Sales Orders made directly in SAP (no `U_ISMS_PO_No`) as ISMS orders with source
 * SAP, so their DRs reach the branch the same way an ISMS SO's do. Runs inside the Copy To
 * follow-up (cron and "Check SAP now"), only once a start date is set in Ordering settings.
 *
 * An imported order is already approved: SAP users made the SO, so it never enters an ISMS
 * approval queue (approving would post a second SO). An open SO waits for its DR; a closed
 * one is imported only when a DR exists (SAP also closes SOs by hand), and a cancelled one
 * never. The Copy To follow-up then applies those DRs by their base SO.
 */

const CURSOR = "sap-so-import";
/** SAP-created SOs per page. Each page is one list call plus one DR lookup for closed SOs. */
const PAGE_SIZE = 50;
/** Who imported orders are created by. Soft-deleted with no login account: it cannot sign in. */
const SAP_IMPORT_USER_NAME = "SAP";

export interface SapSalesOrderImportResult {
  imported: number;
  skipped: number;
}

async function sapGet<T>(creds: SapServiceLayerCredentials, path: string, entity: string) {
  const response = await sapServiceLayerClient.request<T>({
    creds,
    method: "GET",
    path,
    headers: { Prefer: `odata.maxpagesize=${Math.min(sapPageSize(), PAGE_SIZE)}` },
  });
  if (response.statusCode >= 400) {
    throw new Error(sapErrorMessage(response.statusCode, response.rawBody, entity));
  }
  return response.data;
}

/**
 * The cursor stores `<start date>|<last DocEntry>`, so moving the start date in settings
 * restarts the import from the new date instead of continuing after the old position.
 */
function readCursor(lastKey: string | null, since: string): number | null {
  if (!lastKey) return null;
  const [cursorSince, entry] = lastKey.split("|");
  if (cursorSince !== since) return null;
  const docEntry = Number.parseInt(entry ?? "", 10);
  return Number.isInteger(docEntry) ? docEntry : null;
}

async function listPage(
  creds: SapServiceLayerCredentials,
  since: string,
  afterDocEntry: number | null,
): Promise<SapSalesOrder[]> {
  const clauses = ["U_ISMS_PO_No eq null", "Cancelled eq 'tNO'", `DocDate ge '${since}'`];
  if (afterDocEntry != null) clauses.push(`DocEntry gt ${afterDocEntry}`);
  const select = "DocEntry,DocNum,DocDate,DocDueDate,CardCode,DocumentStatus,Comments,DocumentLines";
  const data = await sapGet<{ value?: Record<string, unknown>[] }>(
    creds,
    `/Orders?$filter=${encodeURIComponent(clauses.join(" and "))}&$select=${select}&$orderby=DocEntry&$top=${PAGE_SIZE}`,
    "Orders",
  );
  return (data?.value ?? []).flatMap((row) => {
    const so = parseSapSalesOrder(row);
    return so ? [so] : [];
  });
}

/**
 * DRs copied from these SOs, by SO DocEntry. One `$crossjoin` call: FP 2405 rejects
 * `any()` on document lines, and the DR does not carry an ISMS reference to filter on.
 */
export async function findDeliveryNotesBySalesOrder(
  creds: SapServiceLayerCredentials,
  soDocEntries: readonly number[],
): Promise<Map<number, number[]>> {
  const byOrder = new Map<number, number[]>();
  if (soDocEntries.length === 0) return byOrder;
  const bases = soDocEntries.map((entry) => `DeliveryNotes/DocumentLines/BaseEntry eq ${entry}`).join(" or ");
  const filter = `DeliveryNotes/DocEntry eq DeliveryNotes/DocumentLines/DocEntry and DeliveryNotes/DocumentLines/BaseType eq 17 and (${bases})`;
  const expand = "DeliveryNotes($select=DocEntry),DeliveryNotes/DocumentLines($select=BaseEntry)";
  const data = await sapGet<{ value?: Record<string, Record<string, unknown>>[] }>(
    creds,
    `/$crossjoin(DeliveryNotes,DeliveryNotes/DocumentLines)?$expand=${encodeURIComponent(expand)}&$filter=${encodeURIComponent(filter)}`,
    "DeliveryNotes",
  );
  for (const row of data?.value ?? []) {
    const drEntry = Number(row.DeliveryNotes?.DocEntry);
    const soEntry = Number(row["DeliveryNotes/DocumentLines"]?.BaseEntry);
    if (!Number.isInteger(drEntry) || !Number.isInteger(soEntry)) continue;
    const list = byOrder.get(soEntry) ?? [];
    if (!list.includes(drEntry)) list.push(drEntry);
    byOrder.set(soEntry, list);
  }
  return byOrder;
}

export interface SalesOrderState {
  docNum: number;
  /** Closed in SAP (by a DR, or by hand) or cancelled. */
  closed: boolean;
  cancelled: boolean;
}

/** Status of these SOs in SAP, by DocEntry. One `$select` call. */
export async function findSalesOrderStates(
  creds: SapServiceLayerCredentials,
  soDocEntries: readonly number[],
): Promise<Map<number, SalesOrderState>> {
  const states = new Map<number, SalesOrderState>();
  if (soDocEntries.length === 0) return states;
  const filter = soDocEntries.map((entry) => `DocEntry eq ${entry}`).join(" or ");
  const data = await sapGet<{ value?: Record<string, unknown>[] }>(
    creds,
    `/Orders?$filter=${encodeURIComponent(filter)}&$select=DocEntry,DocNum,DocumentStatus,Cancelled`,
    "Orders",
  );
  for (const row of data?.value ?? []) {
    const docEntry = Number(row.DocEntry);
    const docNum = Number(row.DocNum);
    if (!Number.isInteger(docEntry) || !Number.isInteger(docNum)) continue;
    const cancelled = row.Cancelled === "tYES";
    states.set(docEntry, { docNum, cancelled, closed: cancelled || row.DocumentStatus === "bost_Close" });
  }
  return states;
}

async function loadLookups(tenantId: string, page: SapSalesOrder[]): Promise<SapSalesOrderLookups> {
  const lines = page.flatMap((so) => so.lines);
  const [branches, warehouses, models] = await Promise.all([
    prisma.branch.findMany({
      where: { tenantId, deletedAt: null, sapCode: { in: [...new Set(lines.map((l) => l.branchCode))] } },
      select: { id: true, sapCode: true },
    }),
    prisma.warehouse.findMany({
      where: { tenantId, deletedAt: null, code: { in: [...new Set(lines.map((l) => l.warehouseCode))] } },
      select: { id: true, code: true },
    }),
    prisma.productModel.findMany({
      where: { tenantId, deletedAt: null, skuCode: { in: [...new Set(lines.map((l) => l.itemCode))] } },
      select: { id: true, skuCode: true, brandId: true },
    }),
  ]);
  return {
    branchIdBySapCode: new Map(branches.map((row) => [row.sapCode, row.id])),
    warehouseIdByCode: new Map(warehouses.map((row) => [row.code, row.id])),
    modelBySku: new Map(models.map((row) => [row.skuCode, { id: row.id, brandId: row.brandId }])),
  };
}

/** The tenant's "SAP" user that imported orders are created by, made on first use. */
async function sapImportUserId(tenantId: string): Promise<string> {
  const email = `sap-import@${tenantId}.system.invalid`;
  const existing = await prisma.user.findFirst({ where: { tenantId, email }, select: { id: true } });
  if (existing) return existing.id;
  try {
    const created = await prisma.user.create({
      // No Account row and a non-hash password: Better Auth has nothing to sign in with.
      data: { tenantId, email, name: SAP_IMPORT_USER_NAME, passwordHash: "!", deletedAt: new Date() },
      select: { id: true },
    });
    return created.id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const raced = await prisma.user.findFirst({ where: { tenantId, email }, select: { id: true } });
      if (raced) return raced.id;
    }
    throw e;
  }
}

function dateOrNull(value: string | null): Date | null {
  return value ? new Date(value) : null;
}

async function createImportedOrder(
  tenantId: string,
  userId: string,
  so: SapSalesOrder,
  plan: SapSalesOrderImportPlan,
  deliveryStatusId: string,
): Promise<boolean> {
  let orderId: string;
  try {
    orderId = await prisma.$transaction(async (tx) => {
      const order = await tx.branchOrder.create({
        data: {
          tenantId,
          branchId: plan.branchId,
          brandId: plan.brandId,
          orderType: "manual",
          source: "SAP",
          status: "approved",
          orderNumber: plan.orderNumber,
          notes: so.comments,
          createdById: userId,
          processedAt: dateOrNull(so.docDate) ?? new Date(),
          deliveryDueDate: dateOrNull(so.dueDate),
          sapDocType: "SO",
          sapDocEntry: so.docEntry,
          sapDocNum: so.docNum,
          sapDocRef: `SO-${so.docNum}`,
          sapCardCode: so.cardCode || null,
          details: {
            create: plan.lines.map((line) => ({
              modelId: line.modelId,
              quantity: line.quantity,
              approvedQty: line.quantity,
              sapLineNum: line.sapLineNum,
            })),
          },
        },
        include: { branch: { select: { name: true } } },
      });
      await logisticsService.createDeliveryFromApprovedOrder(
        tenantId,
        userId,
        { id: order.id, branchId: order.branchId, branchName: order.branch.name, orderNumber: order.orderNumber },
        { sourceWarehouseId: plan.sourceWarehouseId, tx, statusCodeId: deliveryStatusId },
      );
      return order.id;
    });
  } catch (e) {
    // Unique order number: an earlier or concurrent run already imported this SO.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false;
    throw e;
  }
  await auditService.log({
    tenantId,
    userId,
    action: "order.imported_from_sap",
    entityType: "BranchOrder",
    entityId: orderId,
    metadata: { orderNumber: plan.orderNumber, sapDocEntry: so.docEntry, sapDocNum: so.docNum, open: so.open },
  });
  return true;
}

/**
 * Import SAP-made Sales Orders dated on or after the tenant's start date, resuming after the
 * last one seen. Does nothing while no start date is set.
 */
export async function importSapSalesOrders(
  creds: SapServiceLayerCredentials,
  tenantId: string,
  deadline: number,
): Promise<SapSalesOrderImportResult> {
  const result: SapSalesOrderImportResult = { imported: 0, skipped: 0 };
  const policy = await prisma.orderingPolicy.findUnique({
    where: { tenantId },
    select: { sapSoImportSince: true },
  });
  if (!policy?.sapSoImportSince) return result;
  const since = policy.sapSoImportSince.toISOString().slice(0, 10);

  const cursor = await sapSyncCursorRepository.get(tenantId, CURSOR);
  let afterDocEntry = readCursor(cursor.lastKey, since);
  let userId: string | null = null;
  let deliveryStatusId: string | null = null;

  while (Date.now() < deadline) {
    const page = await listPage(creds, since, afterDocEntry);
    if (page.length === 0) break;

    const [lookups, alreadyImported] = await Promise.all([
      loadLookups(tenantId, page),
      prisma.branchOrder.findMany({
        where: { tenantId, orderNumber: { in: page.map((so) => sapSalesOrderNumber(so.docNum)) } },
        select: { orderNumber: true },
      }),
    ]);
    const known = new Set(alreadyImported.map((row) => row.orderNumber));
    const decisions = page
      .filter((so) => !known.has(sapSalesOrderNumber(so.docNum)))
      .map((so) => ({ so, decision: planSapSalesOrderImport(so, lookups) }));
    const closedEntries = decisions
      .filter(({ so, decision }) => decision.import && !so.open)
      .map(({ so }) => so.docEntry);
    const drsBySo = await findDeliveryNotesBySalesOrder(creds, closedEntries);

    for (const { so, decision } of decisions) {
      if (!decision.import) {
        result.skipped += 1;
        logger.info({ tenantId, sapDocNum: so.docNum, reason: decision.reason }, "sap SO import: skipped");
        continue;
      }
      if (!so.open && !drsBySo.has(so.docEntry)) {
        result.skipped += 1;
        logger.info({ tenantId, sapDocNum: so.docNum }, "sap SO import: closed without a DR, skipped");
        continue;
      }
      userId ??= await sapImportUserId(tenantId);
      deliveryStatusId ??= await reasonStatusService.requireCodeId(
        tenantId,
        "delivery_workflow",
        DELIVERY_WORKFLOW_CODE.approved,
      );
      if (await createImportedOrder(tenantId, userId, so, decision.plan, deliveryStatusId)) {
        result.imported += 1;
      }
    }

    afterDocEntry = page[page.length - 1].docEntry;
    await sapSyncCursorRepository.advance(tenantId, CURSOR, `${since}|${afterDocEntry}`, 0);
    if (page.length < PAGE_SIZE) break;
  }

  if (result.imported + result.skipped > 0) {
    logger.info({ tenantId, ...result }, "sap SO import finished");
  }
  return result;
}
