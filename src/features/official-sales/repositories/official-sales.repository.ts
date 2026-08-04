import { prisma } from "@/lib/database/client";
import type { OfficialSalesImportRowStatus, Prisma } from "@prisma/client";

export type OfficialSalesRowCreateInput = {
  serial: string;
  drDate: Date | null;
  drNo: string | null;
  branchSold: string | null;
  action: string | null;
  dealer: string | null;
  brand: string | null;
  itemModel: string | null;
  saleAmount: Prisma.Decimal | number | string | null;
  packageName: string | null;
};

export const officialSalesRepository = {
  listStagingRows(tenantId: string) {
    return prisma.officialSalesImportRow.findMany({
      where: { tenantId },
      include: {
        batch: {
          select: {
            id: true,
            fileName: true,
            createdAt: true,
            uploadedBy: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 500,
    });
  },

  createBatchWithRows(
    tenantId: string,
    uploadedById: string,
    fileName: string | null,
    rows: OfficialSalesRowCreateInput[],
  ) {
    return prisma.officialSalesImportBatch.create({
      data: {
        tenantId,
        uploadedById,
        fileName,
        rows: {
          create: rows.map((row) => ({
            tenantId,
            serial: row.serial,
            drDate: row.drDate,
            drNo: row.drNo,
            branchSold: row.branchSold,
            action: row.action,
            dealer: row.dealer,
            brand: row.brand,
            itemModel: row.itemModel,
            saleAmount: row.saleAmount,
            packageName: row.packageName,
          })),
        },
      },
      include: { rows: true },
    });
  },

  findRow(tenantId: string, id: string) {
    return prisma.officialSalesImportRow.findFirst({
      where: { id, tenantId },
    });
  },

  findPendingRows(tenantId: string, ids?: string[]) {
    return prisma.officialSalesImportRow.findMany({
      where: {
        tenantId,
        status: "pending",
        ...(ids?.length ? { id: { in: ids } } : {}),
      },
      orderBy: { createdAt: "asc" },
    });
  },

  findDeletableRows(tenantId: string, ids: string[]) {
    return prisma.officialSalesImportRow.findMany({
      where: {
        tenantId,
        id: { in: ids },
        status: { in: ["pending", "error"] },
      },
      select: { id: true, status: true, serial: true, batchId: true },
    });
  },

  countRowsByIds(tenantId: string, ids: string[]) {
    return prisma.officialSalesImportRow.count({
      where: { tenantId, id: { in: ids } },
    });
  },

  deleteDeletableRows(tenantId: string, ids: string[]) {
    return prisma.officialSalesImportRow.deleteMany({
      where: {
        tenantId,
        id: { in: ids },
        status: { in: ["pending", "error"] },
      },
    });
  },

  updateRowResult(
    id: string,
    data: {
      status: OfficialSalesImportRowStatus;
      result: string;
      processedAt?: Date;
    },
  ) {
    return prisma.officialSalesImportRow.update({
      where: { id },
      data: {
        status: data.status,
        result: data.result,
        processedAt: data.processedAt ?? new Date(),
      },
    });
  },

  clearTemp(tenantId: string, onlyPending = true) {
    return prisma.officialSalesImportRow.deleteMany({
      where: {
        tenantId,
        ...(onlyPending ? { status: "pending" } : {}),
      },
    });
  },

  findInventoryBySerial(tenantId: string, serialNo: string) {
    return prisma.branchInventory.findFirst({
      where: {
        tenantId,
        serialNumber: { serialNo },
      },
      include: {
        branch: { select: { id: true, name: true } },
        serialNumber: {
          select: {
            id: true,
            serialNo: true,
            model: { select: { id: true, skuCode: true, name: true } },
          },
        },
        statusCode: { select: { id: true, code: true, name: true } },
      },
    });
  },

  /**
   * Open (non-closed) sale detail for a serial with frozen Sold/Reserved STATUS.
   * Used to block duplicate Official Sales SALE rows after inventory was reset to STK.
   */
  findOpenSaleDetailBySerial(tenantId: string, serialNo: string) {
    return prisma.branchSalesTransactionDetail.findFirst({
      where: {
        serialNumber: { tenantId, serialNo },
        sale: {
          tenantId,
          atrStatus: { not: "closed" },
        },
        statusCode: {
          code: { in: ["SLD", "RSV"] },
        },
      },
      select: {
        id: true,
        salesId: true,
        sale: { select: { transactionNo: true, atrStatus: true } },
        statusCode: { select: { code: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  },
};
