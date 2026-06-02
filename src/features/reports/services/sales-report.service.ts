import { prisma } from "@/lib/database/client";
import { buildCsvContent } from "@/lib/shared/csv";

export interface SalesReportFilters {
  from?: Date;
  to?: Date;
  branchId?: string;
}

const HEADERS = [
  "DATE",
  "TRANSACTION NO",
  "BRANCH",
  "SERIAL NO",
  "AMOUNT",
  "ATR STATUS",
  "RETURN STATUS",
  "NOTES",
];

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export const salesReportService = {
  async generateCsv(tenantId: string, filters: SalesReportFilters = {}) {
    const sales = await prisma.branchSalesTransaction.findMany({
      where: {
        tenantId,
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
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
        branch: { select: { name: true } },
        serialNumber: { select: { serialNo: true } },
        returnRequest: { select: { status: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const rows = sales.map((s) => [
      formatDate(s.createdAt),
      s.transactionNo,
      s.branch.name,
      s.serialNumber?.serialNo ?? "",
      s.amount.toString(),
      s.atrStatus,
      s.returnRequest?.status ?? "",
      s.notes ?? "",
    ]);

    return buildCsvContent(HEADERS, rows);
  },
};
