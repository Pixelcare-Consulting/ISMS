import { prisma } from "@/lib/database/client";
import { buildCsvContent } from "@/lib/shared/csv";

export interface SalesReportFilters {
  from?: Date;
  to?: Date;
  branchIds?: string[];
}

const HEADERS = [
  "DATE",
  "TRANSACTION NO",
  "BRANCH",
  "STOCK SOURCE BRANCH",
  "SERIAL NO",
  "MODEL",
  "PACKAGE",
  "SALE AMOUNT",
  "ATR STATUS",
  "RETURN STATUS",
  "CUSTOMER",
  "SI/TRANS",
];

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export const salesReportService = {
  async generateCsv(tenantId: string, filters: SalesReportFilters = {}) {
    const dateFilter =
      filters.from || filters.to
        ? {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          }
        : undefined;

    const details = await prisma.branchSalesTransactionDetail.findMany({
      where: {
        sale: {
          tenantId,
          ...(filters.branchIds ? { branchId: { in: filters.branchIds } } : {}),
          ...(dateFilter
            ? {
                OR: [
                  { transactionDate: dateFilter },
                  {
                    AND: [
                      { transactionDate: null },
                      { createdAt: dateFilter },
                    ],
                  },
                ],
              }
            : {}),
        },
      },
      include: {
        serialNumber: { select: { serialNo: true } },
        model: { select: { skuCode: true, name: true } },
        packageType: { select: { name: true } },
        sale: {
          select: {
            transactionNo: true,
            transactionDate: true,
            createdAt: true,
            atrStatus: true,
            customerName: true,
            siTrans: true,
            branch: { select: { name: true } },
            stockSourceBranch: { select: { name: true } },
            returnRequest: { select: { status: true } },
          },
        },
      },
      orderBy: [{ sale: { createdAt: "desc" } }, { createdAt: "asc" }],
    });

    const rows = details.map((d) => {
      const saleDate = d.sale.transactionDate ?? d.sale.createdAt;
      const modelLabel = d.model
        ? `${d.model.skuCode} · ${d.model.name}`
        : "";
      return [
        formatDate(saleDate),
        d.sale.transactionNo,
        d.sale.branch.name,
        d.sale.stockSourceBranch?.name ?? d.sale.branch.name,
        d.serialNumber.serialNo,
        modelLabel,
        d.packageType?.name ?? "",
        (d.saleAmount ?? d.amount ?? 0).toString(),
        d.sale.atrStatus,
        d.sale.returnRequest?.status ?? "",
        d.sale.customerName ?? "",
        d.sale.siTrans ?? "",
      ];
    });

    return buildCsvContent(HEADERS, rows);
  },
};
