import type { Prisma } from "@/lib/database/generated/prisma/client";

type SaleSerialLinkClient = {
  serialNumber: Prisma.TransactionClient["serialNumber"];
  branch: Prisma.TransactionClient["branch"];
};

/**
 * A sale line may store a serial only when that serial, its model, the model's
 * brand, and the stock branch all belong to the sale's company, and the serial's
 * model is the line's model.
 */

export interface SaleSerialLinkInput {
  tenantId: string;
  saleTenantId: string;
  stockBranchTenantId: string;
  detailModelId: string;
  detailBrandId: string | null;
  serialNo: string;
  serialTenantId: string;
  serialModelId: string;
  serialDeleted: boolean;
  modelTenantId: string;
  modelBrandId: string | null;
}

export function saleSerialLinkError(input: SaleSerialLinkInput): string | null {
  if (input.serialDeleted) {
    return `${input.serialNo} is retired and cannot be sold.`;
  }
  if (
    input.saleTenantId !== input.tenantId ||
    input.stockBranchTenantId !== input.tenantId ||
    input.serialTenantId !== input.tenantId ||
    input.modelTenantId !== input.tenantId
  ) {
    return `${input.serialNo} is not in this company.`;
  }
  if (input.serialModelId !== input.detailModelId) {
    return `${input.serialNo} does not match the model on this sale.`;
  }
  if (input.modelBrandId && input.modelBrandId !== input.detailBrandId) {
    return `${input.serialNo} does not match the brand on this sale.`;
  }
  return null;
}

export function assertSaleSerialLink(input: SaleSerialLinkInput): void {
  const error = saleSerialLinkError(input);
  if (error) throw new Error(error);
}

/** Load the serial, model, sale branch, and stock branch, then apply the link guard. */
export async function assertSaleSerialLinkRecord(
  tx: SaleSerialLinkClient,
  input: {
    tenantId: string;
    saleBranchId: string;
    stockBranchId: string;
    detailModelId: string;
    detailBrandId: string | null;
    serialNumberId: string;
  },
): Promise<void> {
  const [serial, saleBranch, stockBranch] = await Promise.all([
    tx.serialNumber.findFirst({
      where: { id: input.serialNumberId },
      select: {
        serialNo: true,
        tenantId: true,
        modelId: true,
        deletedAt: true,
        model: { select: { tenantId: true, brandId: true } },
      },
    }),
    tx.branch.findFirst({
      where: { id: input.saleBranchId },
      select: { tenantId: true },
    }),
    tx.branch.findFirst({
      where: { id: input.stockBranchId },
      select: { tenantId: true },
    }),
  ]);
  if (!serial || !saleBranch || !stockBranch) {
    throw new Error("Serial is not in this company.");
  }
  assertSaleSerialLink({
    tenantId: input.tenantId,
    saleTenantId: saleBranch.tenantId,
    stockBranchTenantId: stockBranch.tenantId,
    detailModelId: input.detailModelId,
    detailBrandId: input.detailBrandId,
    serialNo: serial.serialNo,
    serialTenantId: serial.tenantId,
    serialModelId: serial.modelId,
    serialDeleted: serial.deletedAt != null,
    modelTenantId: serial.model.tenantId,
    modelBrandId: serial.model.brandId,
  });
}

type SaleDetailClaimClient = {
  branchSalesTransactionDetail: {
    updateMany: Prisma.TransactionClient["branchSalesTransactionDetail"]["updateMany"];
  };
};

/**
 * Claim a TO-FOLLOW line that still has no serial. A second assigner gets a
 * conflict and the surrounding transaction rolls the inventory change back.
 */
export async function claimToFollowSaleLine(
  tx: SaleDetailClaimClient,
  input: {
    detailId: string;
    saleId: string;
    serialNumberId: string;
    statusCodeId: string;
    deliveryNo?: string | null;
    deliveryDate?: Date | null;
  },
): Promise<void> {
  const claimed = await tx.branchSalesTransactionDetail.updateMany({
    where: {
      id: input.detailId,
      salesId: input.saleId,
      serialNumberId: null,
    },
    data: {
      serialNumberId: input.serialNumberId,
      statusCodeId: input.statusCodeId,
      ...(input.deliveryNo !== undefined ? { deliveryNo: input.deliveryNo } : {}),
      ...(input.deliveryDate !== undefined ? { deliveryDate: input.deliveryDate } : {}),
    },
  });
  if (claimed.count !== 1) {
    throw new Error("This to-follow line was already assigned a serial.");
  }
}
