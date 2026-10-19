import { prisma } from "@/lib/database/client";
import { reasonStatusRepository } from "@/features/reason-status/repositories/reason-status.repository";
import { DAILY_STOCK_REPORT_HEADERS } from "@/features/reports/constants/report-headers";
import { buildCsvContent } from "@/lib/shared/csv";

export interface DailyStockReportFilters {
  date: Date;
  branchIds?: string[];
}

function dayBounds(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export interface DailyStockReportRow {
  date: string;
  branch: string;
  skuCode: string;
  model: string;
  shelfMax: number;
  invQty: number;
  soldQty: number;
}

export const dailyStockReportService = {
  /** One row per planogram entry; shared by the CSV export and the Stimulsoft dataset. */
  async listRows(tenantId: string, filters: DailyStockReportFilters): Promise<DailyStockReportRow[]> {
    const { start, end } = dayBounds(filters.date);
    const dateLabel = start.toISOString().slice(0, 10);

    const stkCode = await reasonStatusRepository.findCodeId(
      tenantId,
      "inventory_system",
      "STK",
    );
    const stkCodeId = stkCode?.id;

    const planograms = await prisma.branchPlanogram.findMany({
      where: {
        tenantId,
        ...(filters.branchIds ? { branchId: { in: filters.branchIds } } : {}),
        OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: end } }],
      },
      include: {
        branch: { select: { name: true } },
        model: { select: { skuCode: true, name: true } },
      },
      orderBy: [{ branch: { name: "asc" } }, { model: { skuCode: "asc" } }],
    });

    const rows: DailyStockReportRow[] = [];

    for (const entry of planograms) {
      const invCount = stkCodeId
        ? await prisma.branchInventory.count({
            where: {
              tenantId,
              branchId: entry.branchId,
              statusCodeId: stkCodeId,
              serialNumber: { modelId: entry.modelId },
            },
          })
        : 0;

      const soldCount = await prisma.branchSalesTransactionDetail.count({
        where: {
          sale: {
            tenantId,
            branchId: entry.branchId,
            createdAt: { gte: start, lte: end },
          },
          OR: [
            { modelId: entry.modelId },
            { serialNumber: { modelId: entry.modelId } },
          ],
        },
      });

      rows.push({
        date: dateLabel,
        branch: entry.branch.name,
        skuCode: entry.model.skuCode,
        model: entry.model.name,
        shelfMax: entry.maxQty,
        invQty: invCount,
        soldQty: soldCount,
      });
    }

    return rows;
  },

  async generateCsv(tenantId: string, filters: DailyStockReportFilters) {
    const rows = await this.listRows(tenantId, filters);
    return buildCsvContent(
      [...DAILY_STOCK_REPORT_HEADERS],
      rows.map((r) => [r.date, r.branch, r.skuCode, r.model, r.shelfMax, r.invQty, r.soldQty]),
    );
  },
};
