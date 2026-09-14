import type { BranchOrderType } from "@prisma/client";

import { prisma } from "@/lib/database/client";
import { decimalToNumber } from "@/lib/database/decimal";
import { getUserBranchIds } from "@/lib/aor/scope";
import { salesListDetailWhere } from "@/features/sales/constants/sales-list-status";
import { planogramRepository } from "@/features/planogram/repositories/planogram.repository";
import { masterDataRepository } from "@/features/master-data/repositories/master-data.repository";
import { branchRepository } from "@/features/branches/repositories/branch.repository";
import { orderingPolicyService } from "@/features/ordering/services/ordering-policy.service";
import { checkOrderingAllowed } from "@/features/orders/utils/order-window";
import { manilaMonthWindow } from "@/features/orders/utils/manila-calendar";
import type {
  OrderAnalyticsLine,
  OrderAnalyticsPayload,
  OrderInventoryStatusCount,
  OrderWorkspaceAdditionalModel,
  OrderWorkspacePayload,
} from "@/features/orders/types/order-analytics";

const DEFAULT_MIL_DAYS = 30;
const INV_CODE_ORDER = ["STK", "DIT", "RSV", "DEF", "SLD", "OFS"];

function typicalMilDays(thresholds: number[]): number {
  if (thresholds.length === 0) return DEFAULT_MIL_DAYS;
  const counts = new Map<number, number>();
  for (const days of thresholds) {
    counts.set(days, (counts.get(days) ?? 0) + 1);
  }
  let best = DEFAULT_MIL_DAYS;
  let bestCount = 0;
  for (const [days, count] of counts) {
    if (count > bestCount || (count === bestCount && days < best)) {
      best = days;
      bestCount = count;
    }
  }
  return best;
}

function sortInventoryCounts(
  counts: Map<string, number>,
): OrderInventoryStatusCount[] {
  const codes = new Set([...INV_CODE_ORDER, ...counts.keys()]);
  return [...codes]
    .filter((code) => code === "STK" || (counts.get(code) ?? 0) > 0)
    .sort((a, b) => {
      const ai = INV_CODE_ORDER.indexOf(a);
      const bi = INV_CODE_ORDER.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    })
    .map((code) => ({ code, count: counts.get(code) ?? 0 }));
}

function lineAmount(qty: number, srp: number, saleAmount: number | null): number {
  if (saleAmount != null && Number.isFinite(saleAmount) && saleAmount > 0) {
    return saleAmount;
  }
  return qty * srp;
}

type AnalyticsLineMode = "require-brand" | "all-when-unfiltered";

async function loadAnalyticsPayload(
  tenantId: string,
  input: { branchId: string; brandId?: string | null; orderType: BranchOrderType },
  lineMode: AnalyticsLineMode,
): Promise<OrderAnalyticsPayload> {
  const branch = await prisma.branch.findFirst({
    where: { id: input.branchId, tenantId },
    select: {
      id: true,
      name: true,
      dealerId: true,
      dealer: { select: { id: true, name: true } },
    },
  });
  if (!branch) {
    throw new Error("Branch not found");
  }

  const entries = await planogramRepository.listPlanogramModelsForAnalytics(
    tenantId,
    input.branchId,
  );
  const brands = new Map<string, string>();
  for (const entry of entries) {
    if (entry.model.brandId && entry.model.brand) {
      brands.set(entry.model.brandId, entry.model.brand.name);
    }
  }
  const brandList = [...brands.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const brandId =
    input.brandId && brands.has(input.brandId)
      ? input.brandId
      : brandList.length === 1
        ? brandList[0].id
        : (input.brandId ?? null);

  const unfilteredEntries = (() => {
    switch (lineMode) {
      case "require-brand":
        return [];
      case "all-when-unfiltered":
        return entries;
      default: {
        const _exhaustive: never = lineMode;
        return _exhaustive;
      }
    }
  })();

  const brandEntries = brandId
    ? entries.filter((e) => e.model.brandId === brandId)
    : unfilteredEntries;

  const modelIds = brandEntries.map((e) => e.model.id);
  const [invByModel, milRows, monthSales] = await Promise.all([
    planogramRepository.countInventoryByStatusForBranchModels(
      tenantId,
      input.branchId,
      modelIds,
    ),
    planogramRepository.listMilByBranch(tenantId, input.branchId),
    loadBranchBrandMtdSales(tenantId, input.branchId, brandId, modelIds),
  ]);

  const milByModel = new Map(
    milRows.map((row) => [row.modelId, row.daysThreshold] as const),
  );
  const targetDii = typicalMilDays(
    brandEntries.map((e) => milByModel.get(e.model.id) ?? DEFAULT_MIL_DAYS),
  );

  const lines: OrderAnalyticsLine[] = brandEntries.map((entry) => {
    const srp = decimalToNumber(entry.model.srp);
    const cbm = decimalToNumber(entry.model.cbm);
    const inv = invByModel.get(entry.model.id) ?? new Map<string, number>();
    const stkQty = inv.get("STK") ?? 0;
    const ditQty = inv.get("DIT") ?? 0;
    const sales = monthSales.byModel.get(entry.model.id) ?? { qty: 0, amount: 0 };
    const remainingCapacity = Math.max(0, entry.maxQty - stkQty);
    return {
      modelId: entry.model.id,
      skuCode: entry.model.skuCode,
      name: entry.model.name,
      brandId: entry.model.brandId,
      srp,
      cbm,
      maxQty: entry.maxQty,
      milDays: milByModel.get(entry.model.id) ?? DEFAULT_MIL_DAYS,
      inventory: sortInventoryCounts(inv),
      stkQty,
      ditQty,
      salesQty: sales.qty,
      salesAmount: sales.amount,
      rate: monthSales.brandQty > 0 ? sales.qty / monthSales.brandQty : null,
      milQty: entry.maxQty,
      milAmt: entry.maxQty * srp,
      sugQty: remainingCapacity,
      remainingCapacity,
      onPlanogram: true,
    };
  });

  const inventoryAmount = lines.reduce((sum, line) => sum + line.stkQty * line.srp, 0);
  const stkCount = lines.reduce((sum, line) => sum + line.stkQty, 0);
  const ditCount = lines.reduce((sum, line) => sum + line.ditQty, 0);
  const salesAmount = lines.reduce((sum, line) => sum + line.salesAmount, 0);
  const window = manilaMonthWindow();
  const dailySales = salesAmount > 0 ? salesAmount / window.daysElapsed : 0;

  return {
    branchId: branch.id,
    branchName: branch.name,
    dealerId: branch.dealerId,
    dealerName: branch.dealer?.name ?? null,
    brands: brandList,
    brandId,
    orderType: input.orderType,
    daysElapsed: window.daysElapsed,
    summary: {
      targetDii,
      computedDii: dailySales > 0 ? inventoryAmount / dailySales : null,
      inventoryAmount,
      stkCount,
      ditCount,
    },
    lines,
  };
}

export const orderAnalyticsService = {
  async assertBranchInScope(
    tenantId: string,
    userId: string,
    branchId: string,
    hasFullAccess: boolean,
  ) {
    if (hasFullAccess) return;
    const branchIds = await getUserBranchIds(tenantId, userId);
    if (branchIds && !branchIds.includes(branchId)) {
      throw new Error(
        "You can only view order analytics for branches in your area of responsibility.",
      );
    }
  },

  async getAnalytics(
    tenantId: string,
    input: { branchId: string; brandId?: string | null; orderType: BranchOrderType },
  ): Promise<OrderAnalyticsPayload> {
    return loadAnalyticsPayload(tenantId, input, "require-brand");
  },

  async getWorkspace(
    tenantId: string,
    input: { branchId: string; brandId?: string | null; orderType: BranchOrderType },
  ): Promise<OrderWorkspacePayload> {
    const analytics = await loadAnalyticsPayload(tenantId, input, "all-when-unfiltered");
    const [policy, ctx] = await Promise.all([
      orderingPolicyService.getPolicy(tenantId),
      branchRepository.findScheduleContext(tenantId, input.branchId),
    ]);
    const reason = checkOrderingAllowed({
      action: "create",
      orderType: input.orderType,
      policy,
      branchName: ctx?.name,
      schedule: ctx?.deliveryScheduleConfig
        ? { orderDays: ctx.deliveryScheduleConfig.orderDays }
        : null,
    });

    const onGrid = new Set(analytics.lines.map((line) => line.modelId));
    const additionalModels = await loadAdditionalModels(
      tenantId,
      input.branchId,
      input.orderType,
      onGrid,
    );

    return {
      ...analytics,
      windowBlocked: reason !== null,
      windowReason: reason,
      additionalModels,
    };
  },
};

async function loadAdditionalModels(
  tenantId: string,
  branchId: string,
  orderType: BranchOrderType,
  onGrid: Set<string>,
): Promise<OrderWorkspaceAdditionalModel[]> {
  switch (orderType) {
    case "special": {
      const models = await masterDataRepository.listModels(tenantId);
      return models
        .filter((m) => m.status === "active" && !onGrid.has(m.id))
        .map((m) => ({
          id: m.id,
          skuCode: m.skuCode,
          name: m.name,
          brandId: m.brandId,
          srp: decimalToNumber(m.srp),
          cbm: decimalToNumber(m.cbm),
          onPlanogram: false,
          remainingCapacity: Number.MAX_SAFE_INTEGER,
        }));
    }
    case "manual":
    case "auto_replenish": {
      const entries = await planogramRepository.listPlanogramModelsForAnalytics(
        tenantId,
        branchId,
      );
      const extraEntries = entries.filter((entry) => !onGrid.has(entry.model.id));
      const extraIds = extraEntries.map((entry) => entry.model.id);
      const invByModel =
        extraIds.length > 0
          ? await planogramRepository.countInventoryByStatusForBranchModels(
              tenantId,
              branchId,
              extraIds,
            )
          : new Map<string, Map<string, number>>();

      return extraEntries.map((entry) => {
        const stkQty = invByModel.get(entry.model.id)?.get("STK") ?? 0;
        return {
          id: entry.model.id,
          skuCode: entry.model.skuCode,
          name: entry.model.name,
          brandId: entry.model.brandId,
          srp: decimalToNumber(entry.model.srp),
          cbm: decimalToNumber(entry.model.cbm),
          onPlanogram: true,
          remainingCapacity: Math.max(0, entry.maxQty - stkQty),
        };
      });
    }
    default: {
      const _exhaustive: never = orderType;
      throw new Error(`Unhandled order type: ${_exhaustive}`);
    }
  }
}

async function loadBranchBrandMtdSales(
  tenantId: string,
  branchId: string,
  brandId: string | null,
  planogramModelIds: string[],
) {
  const empty = {
    brandQty: 0,
    byModel: new Map<string, { qty: number; amount: number }>(),
  };
  if (!brandId && planogramModelIds.length === 0) return empty;

  const window = manilaMonthWindow();
  const dateFilter = { gte: window.start, lt: window.endExclusive };
  const listWhere = salesListDetailWhere(tenantId);
  const modelScope =
    brandId != null
      ? { OR: [{ brandId }, { model: { brandId } }] }
      : {
          OR: [
            { modelId: { in: planogramModelIds } },
            { model: { id: { in: planogramModelIds } } },
          ],
        };

  const details = await prisma.branchSalesTransactionDetail.findMany({
    where: {
      AND: [
        listWhere,
        {
          sale: {
            branchId,
            OR: [
              { transactionDate: dateFilter },
              { AND: [{ transactionDate: null }, { createdAt: dateFilter }] },
            ],
          },
        },
        modelScope,
      ],
    },
    select: {
      modelId: true,
      saleAmount: true,
      amount: true,
      modelPrice: true,
      model: { select: { id: true, srp: true, brandId: true } },
    },
  });

  const byModel = new Map<string, { qty: number; amount: number }>();
  for (const id of planogramModelIds) {
    byModel.set(id, { qty: 0, amount: 0 });
  }

  let brandQty = 0;
  for (const detail of details) {
    const modelId = detail.modelId ?? detail.model?.id;
    const srp = decimalToNumber(detail.model?.srp);
    const saleAmt = decimalToNumber(detail.saleAmount || detail.amount || detail.modelPrice);
    brandQty += 1;
    if (!modelId) continue;
    const current = byModel.get(modelId) ?? { qty: 0, amount: 0 };
    current.qty += 1;
    current.amount += lineAmount(1, srp, saleAmt || null);
    byModel.set(modelId, current);
  }

  return { brandQty, byModel };
}
