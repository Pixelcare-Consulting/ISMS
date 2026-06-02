import { prisma } from "@/lib/database/client";
import { reasonStatusRepository } from "@/features/reason-status/repositories/reason-status.repository";
import { buildCsvContent } from "@/lib/shared/csv";

export interface DailyStockReportFilters {
  date: Date;
  branchId?: string;
}

const HEADERS = [
  "DATE",
  "BRANCH",
  "SKU",
  "MODEL NAME",
  "PLANOGRAM MAX",
  "INV",
  "SOLD",
];

function dayBounds(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export const dailyStockReportService = {
  async generateCsv(tenantId: string, filters: DailyStockReportFilters) {
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
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
        OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: end } }],
      },
      include: {
        branch: { select: { name: true } },
        model: { select: { skuCode: true, name: true } },
      },
      orderBy: [{ branch: { name: "asc" } }, { model: { skuCode: "asc" } }],
    });

    const rows: (string | number | null | undefined)[][] = [];

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

      const soldCount = await prisma.branchSalesTransaction.count({
        where: {
          tenantId,
          branchId: entry.branchId,
          createdAt: { gte: start, lte: end },
          serialNumber: { modelId: entry.modelId },
        },
      });

      rows.push([
        dateLabel,
        entry.branch.name,
        entry.model.skuCode,
        entry.model.name,
        entry.maxQty,
        invCount,
        soldCount,
      ]);
    }

    return buildCsvContent(HEADERS, rows);
  },
};
