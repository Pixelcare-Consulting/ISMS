import { Prisma } from "@/lib/database/generated/prisma/client";

import { lockSerialNumbers } from "@/features/inventory/services/serial-placement";
import { assertExclusiveClaim } from "@/features/logistics/services/delivery-posting.planner";
import {
  branchScopeError,
  isBranchScopeUnrestricted,
  postingPermissionError,
  type LogisticsPostingAction,
} from "@/features/logistics/services/logistics-posting-access";
import {
  OPEN_PULLOUT_STATUS_CODES,
  OPEN_TRANSFER_STATUS_CODES,
  type HoldCode,
  type InventoryCode,
} from "@/features/logistics/services/posting-planner-types";
import { assertSerialsNotFrozenInStockCount } from "@/features/stock-audit/services/stock-count-freeze";
import { getUserBranchIds } from "@/lib/aor/scope";
import { prisma } from "@/lib/database/client";

export interface PostingActor {
  tenantId: string;
  userId: string;
  permissions?: string[];
}

export type PostingDb = Prisma.TransactionClient;

const INVENTORY_CODES = ["DIT", "STK", "SLD", "OFS", "RSV", "DEF", "FPO", "FW"] as const;

export function postingError(error: unknown, fallback: string): Error {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return new Error("One or more serials are already on another request");
  }
  return error instanceof Error ? error : new Error(fallback);
}

export async function authorizePosting(
  actor: PostingActor,
  action: LogisticsPostingAction,
  branchId: string | null,
): Promise<void> {
  const denied = postingPermissionError(actor.permissions, action);
  if (denied) throw new Error(denied);
  if (!branchId) return;
  await authorizeBranchScope(actor, branchId);
}

/** Throws when the branch is outside the actor's area of responsibility. */
export async function authorizeBranchScope(actor: PostingActor, branchId: string): Promise<void> {
  const scope = isBranchScopeUnrestricted(actor.permissions)
    ? null
    : await getUserBranchIds(actor.tenantId, actor.userId);
  const outside = branchScopeError(scope, branchId);
  if (outside) throw new Error(outside);
}

export function asInventoryCode(code: string | null | undefined): InventoryCode | null {
  if (!code) return null;
  switch (code) {
    case "DIT":
    case "STK":
    case "SLD":
    case "OFS":
    case "RSV":
    case "DEF":
    case "FPO":
    case "FW":
      return code;
    default:
      return null;
  }
}

export function asHoldCode(code: string | null | undefined): HoldCode | null {
  if (code === "STK" || code === "DEF") return code;
  return null;
}

export async function assertMovable(tenantId: string, serialNumberIds: string[]): Promise<void> {
  if (serialNumberIds.length === 0) return;
  await assertSerialsNotFrozenInStockCount(tenantId, serialNumberIds);
  const pending = await prisma.branchDefectReport.findFirst({
    where: {
      tenantId,
      serialNumberId: { in: serialNumberIds },
      status: "pending_inspection",
    },
    select: { serialNumber: { select: { serialNo: true } } },
  });
  if (pending) {
    throw new Error(`${pending.serialNumber.serialNo} is pending defect inspection`);
  }
}

/**
 * Lock serial masters first, in id order, then the branch inventory rows.
 * Two batches cannot deadlock by taking those locks in opposite orders.
 */
export async function lockSerialsThenInventoryRows(
  tx: PostingDb,
  tenantId: string,
  branchId: string,
  serialNumberIds: string[],
): Promise<void> {
  await lockSerialNumbers(tx, serialNumberIds);
  await lockInventoryRows(tx, tenantId, branchId, serialNumberIds);
}

/** Row lock so a second request waits, then sees the first request's lines. */
export async function lockInventoryRows(
  tx: PostingDb,
  tenantId: string,
  branchId: string,
  serialNumberIds: string[],
): Promise<void> {
  if (serialNumberIds.length === 0) return;
  await tx.$queryRaw`
    SELECT id
    FROM branch_inventories
    WHERE tenant_id = ${tenantId}
      AND branch_id = ${branchId}
      AND serial_number_id IN (${Prisma.join(serialNumberIds)})
    ORDER BY serial_number_id
    FOR UPDATE
  `;
}

export async function claimInventory(
  tx: PostingDb,
  input: {
    tenantId: string;
    branchId: string;
    serialNumberIds: string[];
    fromStatusCodeId: string;
    toStatusCodeId: string;
    userId: string;
    message: string;
    toBranchId?: string;
  },
): Promise<void> {
  if (input.serialNumberIds.length === 0) return;
  const moved = await tx.branchInventory.updateMany({
    where: {
      tenantId: input.tenantId,
      branchId: input.branchId,
      serialNumberId: { in: input.serialNumberIds },
      statusCodeId: input.fromStatusCodeId,
    },
    data: {
      statusCodeId: input.toStatusCodeId,
      updatedById: input.userId,
      ...(input.toBranchId ? { branchId: input.toBranchId } : {}),
    },
  });
  assertExclusiveClaim(moved.count, input.serialNumberIds.length, input.message);
}

export async function claimHeader(
  tx: PostingDb,
  model: "branchTransfer" | "branchPullout",
  input: { id: string; tenantId: string; fromStatusCodeIds: string[]; toStatusCodeId: string; message: string },
): Promise<void> {
  const where = {
    id: input.id,
    tenantId: input.tenantId,
    statusCodeId: { in: input.fromStatusCodeIds },
  };
  const data = { statusCodeId: input.toStatusCodeId };
  const claimed =
    model === "branchTransfer"
      ? await tx.branchTransfer.updateMany({ where, data })
      : await tx.branchPullout.updateMany({ where, data });
  assertExclusiveClaim(claimed.count, 1, input.message);
}

export function inventoryCodeList(): readonly string[] {
  return INVENTORY_CODES;
}

export async function openDocumentIdsBySerial(
  tenantId: string,
  serialNumberIds: string[],
  except?: { transferId?: string; pulloutId?: string },
): Promise<Map<string, string[]>> {
  const grouped = new Map<string, string[]>();
  if (serialNumberIds.length === 0) return grouped;

  const [transfers, pullouts] = await Promise.all([
    prisma.branchTransferLine.findMany({
      where: {
        serialNumberId: { in: serialNumberIds },
        ...(except?.transferId ? { transferId: { not: except.transferId } } : {}),
        transfer: {
          tenantId,
          statusCode: { code: { in: [...OPEN_TRANSFER_STATUS_CODES] } },
        },
      },
      select: { serialNumberId: true, transferId: true },
    }),
    prisma.branchPulloutLine.findMany({
      where: {
        serialNumberId: { in: serialNumberIds },
        ...(except?.pulloutId ? { pulloutId: { not: except.pulloutId } } : {}),
        pullout: {
          tenantId,
          statusCode: { code: { in: [...OPEN_PULLOUT_STATUS_CODES] } },
        },
      },
      select: { serialNumberId: true, pulloutId: true },
    }),
  ]);

  for (const row of transfers) {
    const current = grouped.get(row.serialNumberId) ?? [];
    current.push(row.transferId);
    grouped.set(row.serialNumberId, current);
  }
  for (const row of pullouts) {
    const current = grouped.get(row.serialNumberId) ?? [];
    current.push(row.pulloutId);
    grouped.set(row.serialNumberId, current);
  }
  return grouped;
}
