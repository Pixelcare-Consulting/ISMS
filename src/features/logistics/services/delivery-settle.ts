import { assertExclusiveClaim } from "@/features/logistics/services/delivery-posting.planner";
import {
  OPEN_RETURN_STATUSES,
  planReturnSettle,
} from "@/features/logistics/services/delivery-return.planner";
import type { PostingDb } from "@/features/logistics/services/posting-support";
import type { prisma } from "@/lib/database/client";

/**
 * Delivery-header locks and status settles shared by accept, unit transfers and
 * returns. No SAP imports: the SAP adapters reach this through return completion.
 */

/** Row lock on the delivery header: serialises accept, settle, return request, transfer create and return completion. */
export async function lockDeliveryRow(tx: PostingDb, tenantId: string, deliveryId: string): Promise<void> {
  await tx.$queryRaw`
    SELECT id FROM branch_deliveries WHERE id = ${deliveryId} AND tenant_id = ${tenantId} FOR UPDATE
  `;
}

export async function hasOpenReturn(
  db: PostingDb | typeof prisma,
  tenantId: string,
  deliveryId: string,
): Promise<boolean> {
  const count = await db.deliveryReturnRequest.count({
    where: { tenantId, deliveryId, status: { in: [...OPEN_RETURN_STATUSES] } },
  });
  return count > 0;
}

export interface OpenReturnRef {
  serialNumberId: string;
  serialNo: string;
  returnId: string;
  requestNo: string;
}

/**
 * Units on a PENDING_APPROVAL or APPROVED reject request. They can be neither
 * received nor rejected again until that request completes or is cancelled;
 * the rest of the delivery stays free.
 */
export async function findOpenReturnLines(
  db: PostingDb | typeof prisma,
  tenantId: string,
  serialNumberIds: readonly string[],
): Promise<OpenReturnRef[]> {
  if (serialNumberIds.length === 0) return [];
  const rows = await db.deliveryReturnLine.findMany({
    where: {
      serialNumberId: { in: [...serialNumberIds] },
      returnRequest: { tenantId, status: { in: [...OPEN_RETURN_STATUSES] } },
    },
    select: {
      serialNumberId: true,
      serialNumber: { select: { serialNo: true } },
      returnRequest: { select: { id: true, requestNo: true } },
    },
  });
  return rows.map((row) => ({
    serialNumberId: row.serialNumberId,
    serialNo: row.serialNumber.serialNo,
    returnId: row.returnRequest.id,
    requestNo: row.returnRequest.requestNo,
  }));
}

export function onOpenReturnError(ref: Pick<OpenReturnRef, "serialNo" | "requestNo">): string {
  return `Unit ${ref.serialNo} is waiting on reject request ${ref.requestNo}`;
}

/** Throws for the first unit that is on an open reject request. */
export async function assertNotOnOpenReturn(
  db: PostingDb | typeof prisma,
  tenantId: string,
  serialNumberIds: readonly string[],
): Promise<void> {
  const [held] = await findOpenReturnLines(db, tenantId, serialNumberIds);
  if (held) throw new Error(onOpenReturnError(held));
}

/** Resolves a delivery_workflow code id through `tx`, so the lookup shares the transaction. */
export async function txWorkflowCodeId(tx: PostingDb, tenantId: string, code: string): Promise<string> {
  const row = await tx.reasonStatusCode.findFirst({
    where: {
      tenantId,
      code,
      recordStatus: "active",
      reasonStatus: { category: "delivery_workflow", recordStatus: "active" },
    },
    select: { id: true },
  });
  if (!row) throw new Error(`Status code not configured: delivery_workflow/${code}`);
  return row.id;
}

/**
 * Re-derives the delivery status after its return completed (R8b), under the
 * row lock and after the returned units left the branch. Call it once the
 * request is COMPLETED, so its lines count as returned.
 */
export async function settleDeliveryAfterReturn(
  tx: PostingDb,
  tenantId: string,
  deliveryId: string,
): Promise<"accepted" | "partial" | "rejected"> {
  await lockDeliveryRow(tx, tenantId, deliveryId);
  const delivery = await tx.branchDelivery.findFirst({
    where: { id: deliveryId, tenantId },
    select: {
      branchId: true,
      acceptedAt: true,
      statusCodeId: true,
      statusCode: { select: { code: true } },
      lines: { select: { serialNumberId: true } },
    },
  });
  if (!delivery) throw new Error("Delivery not found");
  const serialIds = delivery.lines.map((line) => line.serialNumberId);
  const [stillInTransit, returned] = await Promise.all([
    tx.branchInventory.count({
      where: { tenantId, branchId: delivery.branchId, serialNumberId: { in: serialIds }, statusCode: { code: "DIT" } },
    }),
    tx.deliveryReturnLine.count({
      where: { serialNumberId: { in: serialIds }, returnRequest: { tenantId, deliveryId, status: "COMPLETED" } },
    }),
  ]);
  const next = planReturnSettle({
    status: delivery.statusCode.code,
    stillInTransit,
    allReturned: returned >= serialIds.length,
  });
  if (!next) throw new Error("Only a dispatched delivery still pending acceptance can be returned");
  if (next === delivery.statusCode.code) return next;

  const nextCodeId = await txWorkflowCodeId(tx, tenantId, next);
  const claimed = await tx.branchDelivery.updateMany({
    where: { id: deliveryId, tenantId, statusCodeId: delivery.statusCodeId },
    data: {
      statusCodeId: nextCodeId,
      ...(next === "accepted" && !delivery.acceptedAt ? { acceptedAt: new Date() } : {}),
    },
  });
  assertExclusiveClaim(claimed.count, 1, "This delivery was updated by someone else");
  return next;
}
