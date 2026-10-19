import { prisma } from "@/lib/database/client";
import { buildCsvContent } from "@/lib/shared/csv";

export interface TransferReportFilters {
  from?: Date;
  to?: Date;
  branchIds?: string[];
}

const HEADERS = ["TRANSFER NO", "FROM BRANCH", "TO BRANCH", "STATUS", "DATE", "NOTES"];

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export interface TransferReportRow {
  transferNo: string;
  fromBranch: string;
  toBranch: string;
  status: string;
  date: string;
  notes: string;
}

export const transferReportService = {
  /** Shared by the CSV export and the Stimulsoft dataset. */
  async listRows(tenantId: string, filters: TransferReportFilters = {}): Promise<TransferReportRow[]> {
    const transfers = await prisma.branchTransfer.findMany({
      where: {
        tenantId,
        ...(filters.branchIds
          ? {
              OR: [
                { fromBranchId: { in: filters.branchIds } },
                { toBranchId: { in: filters.branchIds } },
              ],
            }
          : {}),
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

    return transfers.map((t) => ({
      transferNo: t.transferNo,
      fromBranch: t.fromBranch.name,
      toBranch: t.toBranch.name,
      status: t.statusCode.name ?? t.statusCode.code,
      date: formatDate(t.createdAt),
      notes: t.notes ?? "",
    }));
  },

  async generateCsv(tenantId: string, filters: TransferReportFilters = {}) {
    const rows = await this.listRows(tenantId, filters);
    return buildCsvContent(
      HEADERS,
      rows.map((r) => [r.transferNo, r.fromBranch, r.toBranch, r.status, r.date, r.notes]),
    );
  },
};
