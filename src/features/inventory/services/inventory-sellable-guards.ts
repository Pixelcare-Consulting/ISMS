import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/client";

type BranchInventoryReader = Pick<typeof prisma, "branchInventory">;

/** Prisma filter: exclude branch inventory rows with open defect inspection. */
export const sellableStkDefectReportsFilter = {
  none: { status: "pending_inspection" as const },
} satisfies Prisma.BranchDefectReportListRelationFilter;

/**
 * Ensures a unit is active STK at the stock source, matches the sale model
 * when one is expected, and is not blocked by defect workflow.
 */
export async function assertSerialSellableAtStockSource(
  tx: BranchInventoryReader,
  input: {
    tenantId: string;
    serialNumberId: string;
    stockBranchId: string;
    stkCodeId: string;
    /** When set, the serial's model must be this id. */
    expectedModelId?: string;
  },
): Promise<void> {
  const row = await tx.branchInventory.findFirst({
    where: {
      tenantId: input.tenantId,
      serialNumberId: input.serialNumberId,
      branchId: input.stockBranchId,
    },
    select: {
      statusCodeId: true,
      statusCode: { select: { code: true } },
      serialNumber: { select: { serialNo: true, modelId: true } },
      defectReports: {
        where: { status: "pending_inspection" },
        select: { id: true },
        take: 1,
      },
    },
  });

  const serialLabel = row?.serialNumber.serialNo ?? "Serial";

  if (!row || row.statusCodeId !== input.stkCodeId) {
    if (row?.statusCode.code === "DEF") {
      throw new Error(
        `${serialLabel} is defective (DEF) and cannot be sold or reserved`,
      );
    }
    throw new Error(
      `${serialLabel} is not in sellable stock at the stock source branch`,
    );
  }

  if (
    input.expectedModelId &&
    row.serialNumber.modelId !== input.expectedModelId
  ) {
    throw new Error(`${serialLabel} does not match the selected model`);
  }

  if (row.defectReports.length > 0) {
    throw new Error(
      `${serialLabel} is pending defect inspection and cannot be sold or reserved`,
    );
  }
}

export async function assertSerialsSellableForSale(
  tenantId: string,
  items: Array<{
    serialNumberId: string;
    stockBranchId: string;
    expectedModelId?: string;
  }>,
  stkCodeId: string,
): Promise<void> {
  for (const item of items) {
    await assertSerialSellableAtStockSource(prisma, {
      tenantId,
      serialNumberId: item.serialNumberId,
      stockBranchId: item.stockBranchId,
      stkCodeId,
      expectedModelId: item.expectedModelId,
    });
  }
}
