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

export interface SalesReportRow {
  date: string;
  transactionNo: string;
  branch: string;
  stockSourceBranch: string;
  serialNo: string;
  skuCode: string;
  model: string;
  packageType: string;
  saleAmount: number;
  atrStatus: string;
  returnStatus: string;
  customer: string;
  siTrans: string;
}

export const salesReportService = {
  /** One row per sale line; shared by the CSV export and the Stimulsoft dataset. */
  async listRows(tenantId: string, filters: SalesReportFilters = {}): Promise<SalesReportRow[]> {
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

    return details.map((d) => ({
      date: formatDate(d.sale.transactionDate ?? d.sale.createdAt),
      transactionNo: d.sale.transactionNo,
      branch: d.sale.branch.name,
      stockSourceBranch: d.sale.stockSourceBranch?.name ?? d.sale.branch.name,
      serialNo: d.serialNumber?.serialNo ?? "",
      skuCode: d.model?.skuCode ?? "",
      model: d.model?.name ?? "",
      packageType: d.packageType?.name ?? "",
      saleAmount: Number(d.saleAmount ?? d.amount ?? 0),
      atrStatus: d.sale.atrStatus,
      returnStatus: d.sale.returnRequest?.status ?? "",
      customer: d.sale.customerName ?? "",
      siTrans: d.sale.siTrans ?? "",
    }));
  },

  async generateCsv(tenantId: string, filters: SalesReportFilters = {}) {
    const rows = await this.listRows(tenantId, filters);
    return buildCsvContent(
      HEADERS,
      rows.map((r) => [
        r.date,
        r.transactionNo,
        r.branch,
        r.stockSourceBranch,
        r.serialNo,
        r.skuCode ? `${r.skuCode} · ${r.model}` : "",
        r.packageType,
        r.saleAmount.toString(),
        r.atrStatus,
        r.returnStatus,
        r.customer,
        r.siTrans,
      ]),
    );
  },
};
