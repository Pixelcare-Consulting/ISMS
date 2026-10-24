import { assertSerialSellableAtStockSource } from "@/features/inventory/services/inventory-sellable-guards";
import { lockSerialNumbers } from "@/features/inventory/services/serial-placement";
import { assertSerialsNotFrozenInStockCount } from "@/features/stock-audit/services/stock-count-freeze";
import type { Prisma } from "@/lib/database/generated/prisma/client";

type BranchInventoryTx = Pick<Prisma.TransactionClient, "branchInventory" | "$queryRaw">;

/** Conditional STK update matched nothing — another status was not overwritten. */
export const SERIAL_SOLD_OR_RESERVED_AFTER_LOOKUP =
  "This unit was sold or reserved after lookup";

/**
 * Mark a STK unit at the stock source as sold/reserved/official-sold.
 * When stock was taken from an alternate branch, relocate the BranchInventory
 * row to the sold branch in the same update (same pattern as transfer receive).
 */
export async function markSerialSoldFromStockSource(
  tx: BranchInventoryTx,
  input: {
    tenantId: string;
    serialNumberId: string;
    stockBranchId: string;
    soldBranchId: string;
    stkCodeId: string;
    targetStatusCodeId: string;
    updatedById: string;
    /** When set, the serial's model must match before the status move. */
    expectedModelId?: string;
  },
) {
  await lockSerialNumbers(tx, [input.serialNumberId]);
  await assertSerialSellableAtStockSource(tx, {
    tenantId: input.tenantId,
    serialNumberId: input.serialNumberId,
    stockBranchId: input.stockBranchId,
    stkCodeId: input.stkCodeId,
    expectedModelId: input.expectedModelId,
  });
  await assertSerialsNotFrozenInStockCount(input.tenantId, [input.serialNumberId]);

  const relocate = input.stockBranchId !== input.soldBranchId;
  const updated = await tx.branchInventory.updateMany({
    where: {
      tenantId: input.tenantId,
      serialNumberId: input.serialNumberId,
      branchId: input.stockBranchId,
      statusCodeId: input.stkCodeId,
    },
    data: {
      statusCodeId: input.targetStatusCodeId,
      updatedById: input.updatedById,
      ...(relocate ? { branchId: input.soldBranchId } : {}),
    },
  });
  if (updated.count === 0) {
    throw new Error(SERIAL_SOLD_OR_RESERVED_AFTER_LOOKUP);
  }
}

/**
 * Restore a sold/reserved/official-sold unit to STK.
 * Prefers the row at the sold branch (post-relocate encode); falls back to
 * stock source for legacy rows that were never moved.
 * Lands STK at `restoreToBranchId` when set; otherwise at `stockBranchId`.
 */
export async function restoreSerialToStockSource(
  tx: BranchInventoryTx,
  input: {
    tenantId: string;
    serialNumberId: string;
    stockBranchId: string;
    soldBranchId: string;
    stkCodeId: string;
    soldStatusCodeIds: string[];
    updatedById: string;
    /** When set, inventory relocates here instead of stockBranchId. */
    restoreToBranchId?: string;
  },
): Promise<string | null> {
  await lockSerialNumbers(tx, [input.serialNumberId]);
  let oldInv = await tx.branchInventory.findFirst({
    where: {
      tenantId: input.tenantId,
      branchId: input.soldBranchId,
      serialNumberId: input.serialNumberId,
      statusCodeId: { in: input.soldStatusCodeIds },
    },
    select: { id: true, branchId: true, statusCodeId: true },
  });
  if (!oldInv && input.stockBranchId !== input.soldBranchId) {
    oldInv = await tx.branchInventory.findFirst({
      where: {
        tenantId: input.tenantId,
        branchId: input.stockBranchId,
        serialNumberId: input.serialNumberId,
        statusCodeId: { in: input.soldStatusCodeIds },
      },
      select: { id: true, branchId: true, statusCodeId: true },
    });
  }
  if (!oldInv) return null;

  const landBranchId = input.restoreToBranchId ?? input.stockBranchId;

  await tx.branchInventory.update({
    where: { id: oldInv.id },
    data: {
      statusCodeId: input.stkCodeId,
      updatedById: input.updatedById,
      ...(oldInv.branchId !== landBranchId
        ? { branchId: landBranchId }
        : {}),
    },
  });
  return oldInv.statusCodeId;
}
