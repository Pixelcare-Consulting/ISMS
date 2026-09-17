import { prisma } from "@/lib/database/client";
import { decimalToNumber } from "@/lib/database/decimal";
import { formatPeriodDate } from "@/features/master-data/types/client-price-list";
import { pickDisplayPriceListRow } from "@/features/master-data/utils/resolve-price-list";
import { dropsPerMonthForFrequency } from "@/features/demand-planning/engine/demand-planning.constants";
import {
  resolvePagination,
  toPaginatedResult,
  type PaginationInput,
} from "@/lib/shared/pagination";

export type WizardScopeBranch = {
  id: string;
  name: string;
  sapCode: string;
  dealerId: string | null;
  dealerName: string | null;
  frequency: string | null;
  dropsPerMonth: number;
};

export type HistoryAggRow = {
  branchId: string;
  modelId: string;
  qty: number;
  peso: number;
};

function resolveSrp(
  priceLists: Array<{
    amount: { toString(): string } | number;
    periodStart: Date;
    periodEnd: Date;
    packageTypeId: string | null;
  }>,
  fallbackSrp: { toString(): string } | number | null,
): number {
  const rows = priceLists.map((row) => ({
    amount: decimalToNumber(row.amount),
    periodStart: formatPeriodDate(row.periodStart),
    periodEnd: formatPeriodDate(row.periodEnd),
    packageTypeId: row.packageTypeId,
  }));
  const selected = pickDisplayPriceListRow(rows, (row) => row);
  if (selected?.amount != null && selected.amount > 0) return selected.amount;
  return Math.max(0, decimalToNumber(fallbackSrp));
}

export const demandPlanningFactsRepository = {
  listWizardPeriods(tenantId: string) {
    return prisma.planningPeriod.findMany({
      where: { tenantId },
      select: { id: true, label: true, isActive: true, startDate: true, endDate: true },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    });
  },

  listWizardDealers(tenantId: string) {
    return prisma.dealer.findMany({
      where: { tenantId, deletedAt: null, status: "active" },
      select: {
        id: true,
        name: true,
        sapCode: true,
        _count: { select: { branches: { where: { deletedAt: null, status: "active" } } } },
      },
      orderBy: { name: "asc" },
    });
  },

  async listWizardBranches(tenantId: string): Promise<WizardScopeBranch[]> {
    const rows = await prisma.branch.findMany({
      where: { tenantId, deletedAt: null, status: "active" },
      select: {
        id: true,
        name: true,
        sapCode: true,
        dealerId: true,
        dealer: { select: { name: true } },
        deliveryScheduleConfig: {
          select: { frequencyCode: { select: { frequency: true } } },
        },
      },
      orderBy: { sapCode: "asc" },
    });

    return rows.map((row) => {
      const frequency = row.deliveryScheduleConfig?.frequencyCode.frequency ?? null;
      return {
        id: row.id,
        name: row.name,
        sapCode: row.sapCode,
        dealerId: row.dealerId,
        dealerName: row.dealer?.name ?? null,
        frequency,
        dropsPerMonth: dropsPerMonthForFrequency(frequency ?? "monthly"),
      };
    });
  },

  findPeriod(tenantId: string, periodId: string) {
    return prisma.planningPeriod.findFirst({
      where: { id: periodId, tenantId },
    });
  },

  listActiveBranchesByIds(tenantId: string, branchIds: string[]) {
    if (branchIds.length === 0) return Promise.resolve([]);
    return prisma.branch.findMany({
      where: { tenantId, id: { in: branchIds }, deletedAt: null, status: "active" },
      select: {
        id: true,
        name: true,
        sapCode: true,
        dealerId: true,
        deliveryScheduleConfig: {
          select: { frequencyCode: { select: { frequency: true } } },
        },
      },
      orderBy: { sapCode: "asc" },
    });
  },

  listPlanogramModelIds(tenantId: string, branchIds: string[]) {
    if (branchIds.length === 0) return Promise.resolve([]);
    return prisma.branchPlanogram.findMany({
      where: { tenantId, branchId: { in: branchIds } },
      select: { branchId: true, modelId: true },
    });
  },

  listAllowedModelIds(tenantId: string, branchIds: string[]) {
    if (branchIds.length === 0) return Promise.resolve([]);
    return prisma.branchAllowedModel.findMany({
      where: { tenantId, branchId: { in: branchIds } },
      select: { branchId: true, modelId: true },
    });
  },

  listSkuForecasts(tenantId: string, periodId: string, branchIds: string[]) {
    if (branchIds.length === 0) return Promise.resolve([]);
    return prisma.skuForecastTarget.findMany({
      where: { tenantId, periodId, branchId: { in: branchIds } },
      select: { branchId: true, modelId: true, qty: true },
    });
  },

  listBranchTargets(tenantId: string, periodId: string, branchIds: string[]) {
    if (branchIds.length === 0) return Promise.resolve([]);
    return prisma.branchForecastTarget.findMany({
      where: { tenantId, periodId, branchId: { in: branchIds } },
      select: { branchId: true, revenueTarget: true },
    });
  },

  async listSoldStatusIds(tenantId: string): Promise<string[]> {
    const rows = await prisma.reasonStatusCode.findMany({
      where: {
        tenantId,
        recordStatus: "active",
        code: { in: ["SLD", "OFS"], mode: "insensitive" },
      },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  },

  findStkStatusId(tenantId: string) {
    return prisma.reasonStatusCode.findFirst({
      where: {
        tenantId,
        recordStatus: "active",
        code: { equals: "STK", mode: "insensitive" },
        reasonStatus: { category: "inventory_system" },
      },
      select: { id: true },
    });
  },

  async listHistoryTotals(
    tenantId: string,
    branchIds: string[],
    soldStatusIds: string[],
    historyFrom: Date,
    historyTo: Date,
  ): Promise<HistoryAggRow[]> {
    if (branchIds.length === 0 || soldStatusIds.length === 0) return [];

    const details = await prisma.branchSalesTransactionDetail.findMany({
      where: {
        modelId: { not: null },
        statusCodeId: { in: soldStatusIds },
        sale: {
          tenantId,
          branchId: { in: branchIds },
          OR: [
            { transactionDate: { gte: historyFrom, lte: historyTo } },
            { transactionDate: null, createdAt: { gte: historyFrom, lte: historyTo } },
          ],
        },
      },
      select: {
        modelId: true,
        saleAmount: true,
        amount: true,
        modelPrice: true,
        sale: { select: { branchId: true } },
      },
    });

    const buckets = new Map<string, HistoryAggRow>();
    for (const detail of details) {
      if (!detail.modelId) continue;
      const key = `${detail.sale.branchId}:${detail.modelId}`;
      const current = buckets.get(key) ?? {
        branchId: detail.sale.branchId,
        modelId: detail.modelId,
        qty: 0,
        peso: 0,
      };
      current.qty += 1;
      current.peso +=
        decimalToNumber(detail.saleAmount) ||
        decimalToNumber(detail.amount) ||
        decimalToNumber(detail.modelPrice);
      buckets.set(key, current);
    }
    return [...buckets.values()];
  },

  async listStkOnHand(
    tenantId: string,
    branchIds: string[],
    modelIds: string[],
    stkStatusId: string | null,
  ): Promise<Array<{ branchId: string; modelId: string; qty: number }>> {
    if (!stkStatusId || branchIds.length === 0 || modelIds.length === 0) return [];

    const rows = await prisma.branchInventory.findMany({
      where: {
        tenantId,
        branchId: { in: branchIds },
        statusCodeId: stkStatusId,
        serialNumber: { modelId: { in: modelIds } },
      },
      select: {
        branchId: true,
        serialNumber: { select: { modelId: true } },
      },
    });

    const counts = new Map<string, { branchId: string; modelId: string; qty: number }>();
    for (const row of rows) {
      const modelId = row.serialNumber.modelId;
      const key = `${row.branchId}:${modelId}`;
      const current = counts.get(key) ?? { branchId: row.branchId, modelId, qty: 0 };
      current.qty += 1;
      counts.set(key, current);
    }
    return [...counts.values()];
  },

  async listModelsWithPricing(tenantId: string, modelIds: string[]) {
    if (modelIds.length === 0) return [];
    const models = await prisma.productModel.findMany({
      where: { tenantId, id: { in: modelIds } },
      select: {
        id: true,
        skuCode: true,
        srp: true,
        series: { select: { name: true, code: true } },
        priceLists: {
          select: {
            amount: true,
            periodStart: true,
            periodEnd: true,
            packageTypeId: true,
          },
        },
      },
    });

    return models.map((model) => ({
      modelId: model.id,
      skuCode: model.skuCode,
      series: model.series?.name || model.series?.code || "Unassigned",
      srp: resolveSrp(model.priceLists, model.srp),
    }));
  },

  async listActiveBranchesPaginated(
    tenantId: string,
    pagination?: PaginationInput,
    filters?: { q?: string },
  ) {
    const { limit, page, skip } = resolvePagination(pagination);
    const q = filters?.q?.trim();
    const where = {
      tenantId,
      deletedAt: null,
      status: "active" as const,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { sapCode: { contains: q, mode: "insensitive" as const } },
              { dealer: { name: { contains: q, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.branch.findMany({
        where,
        select: {
          id: true,
          name: true,
          sapCode: true,
          dealer: { select: { name: true } },
          deliveryScheduleConfig: {
            select: { frequencyCode: { select: { frequency: true } } },
          },
        },
        orderBy: { sapCode: "asc" },
        skip,
        take: limit,
      }),
      prisma.branch.count({ where }),
    ]);

    return toPaginatedResult(
      items.map((row) => ({
        id: row.id,
        name: row.name,
        sapCode: row.sapCode,
        dealerName: row.dealer?.name ?? null,
        frequency: row.deliveryScheduleConfig?.frequencyCode.frequency ?? null,
        dropsPerMonth: dropsPerMonthForFrequency(
          row.deliveryScheduleConfig?.frequencyCode.frequency ?? "monthly",
        ),
      })),
      total,
      page,
      limit,
    );
  },

  async countPlanogramSkusByBranch(tenantId: string, branchIds: string[]) {
    if (branchIds.length === 0) return [];
    return prisma.branchPlanogram.groupBy({
      by: ["branchId"],
      where: { tenantId, branchId: { in: branchIds } },
      _count: { _all: true },
    });
  },

  async listSkuForecastsWithSrp(tenantId: string, periodId: string, branchIds?: string[]) {
    return prisma.skuForecastTarget.findMany({
      where: {
        tenantId,
        periodId,
        ...(branchIds && branchIds.length > 0 ? { branchId: { in: branchIds } } : {}),
      },
      select: {
        branchId: true,
        qty: true,
        model: { select: { srp: true } },
      },
    });
  },

  async listAllBranchTargets(tenantId: string, periodId: string) {
    return prisma.branchForecastTarget.findMany({
      where: { tenantId, periodId },
      select: { branchId: true, revenueTarget: true },
    });
  },

  async listBranchIdsWithHistory(
    tenantId: string,
    branchIds: string[],
    soldStatusIds: string[],
    historyFrom: Date,
    historyTo: Date,
  ): Promise<string[]> {
    if (branchIds.length === 0 || soldStatusIds.length === 0) return [];
    const rows = await prisma.branchSalesTransaction.findMany({
      where: {
        tenantId,
        branchId: { in: branchIds },
        OR: [
          { transactionDate: { gte: historyFrom, lte: historyTo } },
          { transactionDate: null, createdAt: { gte: historyFrom, lte: historyTo } },
        ],
        details: {
          some: {
            modelId: { not: null },
            statusCodeId: { in: soldStatusIds },
          },
        },
      },
      distinct: ["branchId"],
      select: { branchId: true },
    });
    return rows.map((row) => row.branchId);
  },

  findActiveBranch(tenantId: string, branchId: string) {
    return prisma.branch.findFirst({
      where: { tenantId, id: branchId, deletedAt: null, status: "active" },
      select: {
        id: true,
        name: true,
        sapCode: true,
        dealer: { select: { name: true } },
        deliveryScheduleConfig: {
          select: { frequencyCode: { select: { frequency: true } } },
        },
      },
    });
  },
};
