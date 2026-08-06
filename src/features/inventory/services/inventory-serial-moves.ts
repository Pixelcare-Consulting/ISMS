import { prisma } from "@/lib/database/client";

type BranchInventoryTx = Pick<typeof prisma, "branchInventory">;

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
  },
) {
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
    throw new Error("Serial is not in sellable stock at the stock source branch");
  }
}

/**
 * Restore a sold/reserved/official-sold unit to STK at the stock source.
 * Prefers the row at the sold branch (post-relocate encode); falls back to
 * stock source for legacy rows that were never moved.
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
  },
): Promise<string | null> {
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

  await tx.branchInventory.update({
    where: { id: oldInv.id },
    data: {
      statusCodeId: input.stkCodeId,
      updatedById: input.updatedById,
      ...(oldInv.branchId !== input.stockBranchId
        ? { branchId: input.stockBranchId }
        : {}),
    },
  });
  return oldInv.statusCodeId;
}
