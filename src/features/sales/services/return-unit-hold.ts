import { statusUpdatedStamp } from "@/features/inventory/lib/status-updated-stamp";
import { lockSerialNumbers } from "@/features/inventory/services/serial-placement";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import { RESERVE_ODRF_CODE } from "@/features/sales/constants/return-history-status";
import type { Prisma } from "@/lib/database/generated/prisma/client";

/**
 * A requested branch return holds the sold unit at the branch sold as RSV. (SC sales hold
 * theirs as Reserve ODRF in SC stock; see sc-service-return.service.)
 * The unit's prior status is written on its request history row so a reject can put it back.
 */

const RETURN_RESERVE_FROM_CODES = ["SLD", "OFS", "RSV"] as const;
export type ReturnReserveFromCode = (typeof RETURN_RESERVE_FROM_CODES)[number];

export type ReturnHoldCode = "RSV" | typeof RESERVE_ODRF_CODE;

const PRIOR_INVENTORY_STATUS = /· was (Official Sold|Sold|Reserved) \(request /u;

const PRIOR_STATUS_LABEL: Record<ReturnReserveFromCode, string> = {
  SLD: "Sold",
  OFS: "Official Sold",
  RSV: "Reserved",
};

function isReturnReserveFromCode(code: string): code is ReturnReserveFromCode {
  return (RETURN_RESERVE_FROM_CODES as readonly string[]).includes(code);
}

function priorInventoryStatusFromHistory(
  details: string | null | undefined,
): ReturnReserveFromCode | null {
  const label = PRIOR_INVENTORY_STATUS.exec(details ?? "")?.[1];
  if (label === "Official Sold") return "OFS";
  if (label === "Sold") return "SLD";
  if (label === "Reserved") return "RSV";
  return null;
}

export function returnRequestHistoryDetails(
  actionLabel: string,
  transactionNo: string,
  returnRequestId: string,
  priorStatus: ReturnReserveFromCode | null,
): string {
  const prior = priorStatus ? ` · was ${PRIOR_STATUS_LABEL[priorStatus]}` : "";
  return `${actionLabel} ${transactionNo}${prior} (request ${returnRequestId})`;
}

export interface ReturnReserveCodeIds {
  sldCodeId: string;
  ofsCodeId: string;
  rsvCodeId: string;
  /** Null until the tenant has the Reserve ODRF code (seeded by migration). */
  odrfCodeId: string | null;
}

function reserveFromCodeId(code: ReturnReserveFromCode, ids: ReturnReserveCodeIds): string {
  switch (code) {
    case "SLD":
      return ids.sldCodeId;
    case "OFS":
      return ids.ofsCodeId;
    case "RSV":
      return ids.rsvCodeId;
    default: {
      const _exhaustive: never = code;
      return _exhaustive;
    }
  }
}

export function holdCodeId(code: ReturnHoldCode, ids: ReturnReserveCodeIds): string | null {
  return code === "RSV" ? ids.rsvCodeId : ids.odrfCodeId;
}

export async function loadReturnReserveCodeIds(
  tenantId: string,
): Promise<ReturnReserveCodeIds | null> {
  const [sldCodeId, ofsCodeId, rsvCodeId, odrfCodeId] = await Promise.all([
    reasonStatusService.findCodeId(tenantId, "inventory_system", "SLD"),
    reasonStatusService.findCodeId(tenantId, "inventory_system", "OFS"),
    reasonStatusService.findCodeId(tenantId, "inventory_system", "RSV"),
    reasonStatusService.findCodeId(tenantId, "inventory_system", RESERVE_ODRF_CODE),
  ]);
  if (!sldCodeId || !ofsCodeId || !rsvCodeId) return null;
  return { sldCodeId, ofsCodeId, rsvCodeId, odrfCodeId };
}

type ReturnReserveTx = Pick<
  Prisma.TransactionClient,
  "branchInventory" | "serialNumberHistory" | "$queryRaw"
>;

/**
 * Sold, Official Sold, or Reserved at the branch sold becomes the hold code.
 * Returns the status the unit had, so a later reject can put it back.
 */
export async function markSoldSerialReserved(
  tx: ReturnReserveTx,
  input: {
    tenantId: string;
    userId: string;
    soldBranchId: string;
    serialNumberId: string;
    codes: ReturnReserveCodeIds;
    holdCode: ReturnHoldCode;
  },
): Promise<ReturnReserveFromCode | null> {
  const targetCodeId = holdCodeId(input.holdCode, input.codes);
  if (!targetCodeId) throw new Error(`Status code not configured: inventory_system/${input.holdCode}`);
  const { sldCodeId, ofsCodeId, rsvCodeId } = input.codes;

  await lockSerialNumbers(tx, [input.serialNumberId]);
  const row = await tx.branchInventory.findFirst({
    where: {
      tenantId: input.tenantId,
      branchId: input.soldBranchId,
      serialNumberId: input.serialNumberId,
      statusCodeId: { in: [sldCodeId, ofsCodeId, rsvCodeId] },
    },
    select: { id: true, statusCode: { select: { code: true } } },
  });
  if (!row || !isReturnReserveFromCode(row.statusCode.code)) return null;

  await tx.branchInventory.updateMany({
    where: { id: row.id, statusCodeId: { in: [sldCodeId, ofsCodeId, rsvCodeId] } },
    data: {
      statusCodeId: targetCodeId,
      updatedById: input.userId,
      ...statusUpdatedStamp(row.statusCode.code, input.holdCode),
    },
  });
  return row.statusCode.code;
}

/** Put a requested unit back to the status remembered on its request history row. */
export async function restoreSerialAfterReturnReject(
  tx: ReturnReserveTx,
  input: {
    tenantId: string;
    userId: string;
    soldBranchId: string;
    returnRequestId: string;
    codes: ReturnReserveCodeIds;
    holdCode: ReturnHoldCode;
  },
): Promise<void> {
  const fromCodeId = holdCodeId(input.holdCode, input.codes);
  if (!fromCodeId) return;
  const history = await tx.serialNumberHistory.findFirst({
    where: {
      tenantId: input.tenantId,
      txnType: { in: ["return", "replacement"] },
      details: { contains: `(request ${input.returnRequestId})` },
    },
    orderBy: { createdAt: "asc" },
    select: { serialNumberId: true, details: true },
  });
  const prior = priorInventoryStatusFromHistory(history?.details);
  if (!history || !prior) return;

  await lockSerialNumbers(tx, [history.serialNumberId]);
  await tx.branchInventory.updateMany({
    where: {
      tenantId: input.tenantId,
      branchId: input.soldBranchId,
      serialNumberId: history.serialNumberId,
      statusCodeId: fromCodeId,
    },
    data: {
      statusCodeId: reserveFromCodeId(prior, input.codes),
      updatedById: input.userId,
      ...statusUpdatedStamp(input.holdCode, prior),
    },
  });
}
