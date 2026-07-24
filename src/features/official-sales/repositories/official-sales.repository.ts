import { prisma } from "@/lib/database/client";
import type { OfficialSalesImportRowStatus } from "@prisma/client";

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
    rows: { serial: string; drDate: Date | null; drNo: string | null }[],
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
};
