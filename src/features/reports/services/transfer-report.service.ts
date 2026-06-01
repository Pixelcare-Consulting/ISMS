import { prisma } from "@/lib/database/client";
import { buildCsvContent } from "@/lib/shared/csv";

export interface TransferReportFilters {
  from?: Date;
  to?: Date;
}

const HEADERS = ["TRANSFER NO", "FROM BRANCH", "TO BRANCH", "STATUS", "DATE", "NOTES"];

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export const transferReportService = {
  async generateCsv(tenantId: string, filters: TransferReportFilters = {}) {
    const transfers = await prisma.branchTransfer.findMany({
      where: {
        tenantId,
        ...(filters.from || filters.to
          ? {
              createdAt: {
                ...(filters.from ? { gte: filters.from } : {}),
                ...(filters.to ? { lte: filters.to } : {}),
              },
            }
          : {}),
      },
      include: {
        fromBranch: { select: { name: true } },
        toBranch: { select: { name: true } },
        statusCode: { select: { code: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const rows = transfers.map((t) => [
      t.transferNo,
      t.fromBranch.name,
      t.toBranch.name,
      t.statusCode.name ?? t.statusCode.code,
      formatDate(t.createdAt),
      t.notes ?? "",
    ]);

    return buildCsvContent(HEADERS, rows);
  },
};
