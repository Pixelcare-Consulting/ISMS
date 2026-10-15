import type { BranchDefectReportStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/client";

const reportListInclude = {
  branch: { select: { id: true, name: true, sapCode: true } },
  serialNumber: {
    select: {
      id: true,
      serialNo: true,
      model: { select: { skuCode: true, name: true } },
    },
  },
  reporter: { select: { id: true, name: true, email: true } },
  decider: { select: { id: true, name: true, email: true } },
  photos: {
    orderBy: { sortOrder: "asc" as const },
    select: {
      id: true,
      fileName: true,
      storagePath: true,
      mimeType: true,
      sizeBytes: true,
      sortOrder: true,
    },
  },
} satisfies Prisma.BranchDefectReportInclude;

export type DefectReportListRow = Prisma.BranchDefectReportGetPayload<{
  include: typeof reportListInclude;
}>;

export const defectRepository = {
  findOpenPendingByBranchInventoryId(
    tenantId: string,
    branchInventoryId: string,
  ) {
    return prisma.branchDefectReport.findFirst({
      where: {
        tenantId,
        branchInventoryId,
        status: "pending_inspection",
      },
    });
  },

  async findOpenPendingBranchInventoryIds(
    tenantId: string,
    branchInventoryIds: string[],
  ): Promise<Set<string>> {
    if (branchInventoryIds.length === 0) {
      return new Set();
    }
    const rows = await prisma.branchDefectReport.findMany({
      where: {
        tenantId,
        branchInventoryId: { in: branchInventoryIds },
        status: "pending_inspection",
      },
      select: { branchInventoryId: true },
    });
    return new Set(rows.map((row) => row.branchInventoryId));
  },

  findById(tenantId: string, reportId: string) {
    return prisma.branchDefectReport.findFirst({
      where: { id: reportId, tenantId },
      include: {
        branchInventory: {
          include: {
            statusCode: { select: { id: true, code: true, name: true } },
          },
        },
        serialNumber: { select: { id: true, serialNo: true } },
        branch: { select: { id: true, name: true } },
        photos: true,
      },
    });
  },

  listPending(
    tenantId: string,
    branchIds: string[],
    pagination?: { page?: number; limit?: number },
  ) {
    if (branchIds.length === 0) {
      return Promise.resolve({ items: [] as DefectReportListRow[], total: 0 });
    }
    const page = Math.max(1, pagination?.page ?? 1);
    const limit = Math.min(100, Math.max(1, pagination?.limit ?? 25));
    const skip = (page - 1) * limit;
    const where: Prisma.BranchDefectReportWhereInput = {
      tenantId,
      status: "pending_inspection",
      branchId: { in: branchIds },
    };
    return prisma.$transaction(async (tx) => {
      const [items, total] = await Promise.all([
        tx.branchDefectReport.findMany({
          where,
          include: reportListInclude,
          orderBy: { reportedAt: "asc" },
          skip,
          take: limit,
        }),
        tx.branchDefectReport.count({ where }),
      ]);
      return { items, total };
    });
  },

  createReportWithPhotos(input: {
    tenantId: string;
    branchInventoryId: string;
    serialNumberId: string;
    branchId: string;
    modelId: string;
    reason: string;
    remarks?: string;
    reporterUserId: string;
    photos?: Array<{
      fileName: string;
      storagePath: string;
      mimeType: string;
      sizeBytes: number;
      sortOrder: number;
      uploadedById: string;
    }>;
  }) {
    return prisma.$transaction(async (tx) => {
      const report = await tx.branchDefectReport.create({
        data: {
          tenantId: input.tenantId,
          branchInventoryId: input.branchInventoryId,
          serialNumberId: input.serialNumberId,
          branchId: input.branchId,
          modelId: input.modelId,
          reason: input.reason,
          remarks: input.remarks,
          reporterUserId: input.reporterUserId,
          status: "pending_inspection",
        },
      });
      if (input.photos?.length) {
        await tx.branchDefectReportPhoto.createMany({
          data: input.photos.map((p) => ({
            reportId: report.id,
            ...p,
          })),
        });
      }
      return report;
    });
  },

  closeReport(input: {
    tenantId: string;
    reportId: string;
    status: Extract<BranchDefectReportStatus, "approved" | "rejected">;
    deciderUserId: string;
    decidedAt: Date;
    decisionRemarks?: string;
  }) {
    return prisma.branchDefectReport.update({
      where: { id: input.reportId, tenantId: input.tenantId },
      data: {
        status: input.status,
        deciderUserId: input.deciderUserId,
        decidedAt: input.decidedAt,
        decisionRemarks: input.decisionRemarks,
      },
    });
  },

  writeDefectHistory(input: {
    tenantId: string;
    serialNumberId: string;
    details: string;
    status?: string;
    createdById: string;
  }) {
    return prisma.serialNumberHistory.create({
      data: {
        tenantId: input.tenantId,
        serialNumberId: input.serialNumberId,
        txnType: "defect",
        details: input.details,
        status: input.status,
        createdById: input.createdById,
      },
    });
  },
};
