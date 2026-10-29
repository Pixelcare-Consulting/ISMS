import type { BranchOrderStatus } from "@prisma/client";

import { prisma } from "@/lib/database/client";
import { decimalToNumber } from "@/lib/database/decimal";
import { sellableStkDefectReportsFilter } from "@/features/inventory/services/inventory-sellable-guards";
import { planogramRepository } from "@/features/planogram/repositories/planogram.repository";
import { reasonStatusRepository } from "@/features/reason-status/repositories/reason-status.repository";
import { salesListDetailWhere } from "@/features/sales/constants/sales-list-status";
import {
  findReleasedPlanning,
  suggestionDb,
  sumPlanningCoverage,
} from "@/features/orders/lib/suggestion-pool";
import { applyAutoReplenishWorksheetSuggestions } from "@/features/orders/lib/order-worksheet-metrics";
import {
  assembleOrderWorksheet,
  WORKSHEET_OUTSTANDING_EXCLUDED_STATUSES,
  type OrderWorksheetLoadOptions,
  type WorksheetModelFact,
  type WorksheetOrderLineFact,
  type WorksheetPulloutFact,
  type WorksheetSalesByModel,
  type WorksheetSerialFact,
  type WorksheetTransferFact,
} from "@/features/orders/lib/order-worksheet";
import { resolveActiveOrderPrice } from "@/features/master-data/utils/resolve-active-order-price";
import type {
  OrderAnalyticsBrand,
  OrderWorksheetPayload,
} from "@/features/orders/types/order-analytics";
import { manilaMonthWindow } from "@/features/orders/utils/manila-calendar";

const PENDING_DEFECT_INSPECTION = sellableStkDefectReportsFilter.none.status;

type PlanogramEntry = Awaited<
  ReturnType<typeof planogramRepository.listPlanogramModelsForAnalytics>
>[number];

function uniqueIds(ids: readonly string[] | undefined): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids ?? []) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

function normalizeBrandId(brandId: string | null | undefined): string | null {
  const trimmed = brandId?.trim();
  return trimmed ? trimmed : null;
}

function lineAmount(srp: number, saleAmount: number | null): number {
  if (saleAmount != null && Number.isFinite(saleAmount) && saleAmount > 0) {
    return saleAmount;
  }
  return srp;
}

function toPlanogramFact(entry: PlanogramEntry): WorksheetModelFact {
  return {
    modelId: entry.model.id,
    skuCode: entry.model.skuCode,
    name: entry.model.name,
    brandId: entry.model.brandId,
    brandName: entry.model.brand?.name ?? null,
    modelStatus: "active",
    origin: "planogram",
    onPlanogram: true,
    shelfMax: entry.maxQty,
    srp: resolveActiveOrderPrice(entry.model.priceLists, entry.model.srp),
    cbm: decimalToNumber(entry.model.cbm),
  };
}

function addBrand(brands: Map<string, string>, brandId: string | null, brandName: string | null) {
  if (!brandId || !brandName || brands.has(brandId)) return;
  brands.set(brandId, brandName);
}

export async function loadOrderWorksheet(
  tenantId: string,
  input: OrderWorksheetLoadOptions,
): Promise<OrderWorksheetPayload> {
  const now = input.now ?? new Date();
  const window = manilaMonthWindow(now);
  const inventoryAsOf = now.toISOString();
  const brandId = normalizeBrandId(input.brandId);

  const quotaDate = new Date(Date.UTC(window.year, window.month - 1, 1));
  const [branch, entries, milRows, statusCodes, quotaRows] = await Promise.all([
    prisma.branch.findFirst({
      where: { id: input.branchId, tenantId },
      select: {
        id: true,
        name: true,
        dealerId: true,
        dealer: { select: { id: true, name: true } },
        deliveryScheduleConfig: {
          select: { frequencyCode: { select: { code: true } } },
        },
      },
    }),
    planogramRepository.listPlanogramModelsForAnalytics(tenantId, input.branchId),
    planogramRepository.listMilByBranch(tenantId, input.branchId),
    reasonStatusRepository.listActiveCodesByCategory(tenantId, "inventory_system"),
    prisma.branchQuota.findMany({
      where: { tenantId, branchId: input.branchId, quotaDate },
      select: { brandId: true, quotaAmount: true },
    }),
  ]);
  if (!branch) throw new Error("Branch not found");

  const brandNames = new Map<string, string>();
  const entryById = new Map<string, PlanogramEntry>();
  for (const entry of entries) {
    entryById.set(entry.model.id, entry);
    addBrand(brandNames, entry.model.brandId, entry.model.brand?.name ?? null);
  }

  const visibleEntries = brandId
    ? entries.filter((entry) => entry.model.brandId === brandId)
    : entries;
  const visibleIds = new Set(visibleEntries.map((entry) => entry.model.id));
  const historicalIds = uniqueIds(input.existingModelIds).filter((id) => !visibleIds.has(id));
  const extraPlanogram = historicalIds
    .map((id) => entryById.get(id))
    .filter((entry): entry is PlanogramEntry => entry != null);
  const idsToFetch = historicalIds.filter((id) => !entryById.has(id));

  const historicalFacts = idsToFetch.length
    ? await loadHistoricalFacts(tenantId, input.branchId, idsToFetch, brandNames)
    : [];

  const models = [
    ...visibleEntries.map(toPlanogramFact),
    ...extraPlanogram.map(toPlanogramFact),
    ...historicalFacts,
  ];
  const modelIds = models.map((model) => model.modelId);
  const facts =
    modelIds.length === 0
      ? emptyFacts()
      : await loadWorksheetFacts(
          tenantId,
          input.branchId,
          modelIds,
          input.excludeOrderId,
          window,
        );

  const brands: OrderAnalyticsBrand[] = [...brandNames.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const payload = assembleOrderWorksheet({
    branch: {
      id: branch.id,
      name: branch.name,
      dealerId: branch.dealerId,
      dealerName: branch.dealer?.name ?? null,
    },
    orderType: input.orderType,
    brandId,
    brandName: brandId ? (brandNames.get(brandId) ?? null) : null,
    brands,
    models,
    serials: facts.serials,
    pullouts: facts.pullouts,
    transfers: facts.transfers,
    deliveriesIntoBranch: facts.deliveriesIntoBranch,
    orderLines: facts.orderLines,
    sales: facts.sales,
    window,
    inventoryAsOf,
    deliveryFrequencyCode: branch.deliveryScheduleConfig?.frequencyCode.code ?? null,
    brandQuotas: quotaRows.map((row) => ({
      brandId: row.brandId,
      quantity: decimalToNumber(row.quotaAmount),
    })),
    milDaysByModel: new Map(milRows.map((row) => [row.modelId, row.daysThreshold] as const)),
    statusColors: new Map(statusCodes.map((code) => [code.code, code.color] as const)),
  });

  if (input.orderType !== "auto_replenish") return payload;
  return overlayAutoReplenishSuggestions(tenantId, input.branchId, payload);
}

async function overlayAutoReplenishSuggestions(
  tenantId: string,
  branchId: string,
  payload: OrderWorksheetPayload,
): Promise<OrderWorksheetPayload> {
  const db = suggestionDb();
  const released = await findReleasedPlanning(db, tenantId, branchId);
  if (!released) {
    return {
      ...payload,
      lines: applyAutoReplenishWorksheetSuggestions(payload.lines, { released: false }),
    };
  }

  const modelIds = payload.lines.map((line) => line.modelId);
  const coverage = await sumPlanningCoverage(db, {
    tenantId,
    branchId,
    periodId: released.periodId,
    periodLabel: released.periodLabel,
    documentNumber: released.documentNumber,
    modelIds,
  });
  const dropByModel = new Map(
    released.lines.map((line) => [line.modelId, line.releasedDrop1Qty] as const),
  );
  const byModel = new Map(
    modelIds.map((modelId) => {
      const covered = coverage.get(modelId) ?? { allocatedQty: 0, legacyUnallocatedQty: 0 };
      return [
        modelId,
        {
          releasedDrop1Qty: dropByModel.get(modelId) ?? 0,
          allocatedQty: covered.allocatedQty,
          legacyUnallocatedQty: covered.legacyUnallocatedQty,
        },
      ] as const;
    }),
  );

  return {
    ...payload,
    lines: applyAutoReplenishWorksheetSuggestions(payload.lines, { released: true, byModel }),
  };
}

function emptyFacts(): {
  serials: WorksheetSerialFact[];
  pullouts: WorksheetPulloutFact[];
  transfers: WorksheetTransferFact[];
  deliveriesIntoBranch: { serialNumberId: string }[];
  orderLines: WorksheetOrderLineFact[];
  sales: WorksheetSalesByModel;
} {
  return {
    serials: [],
    pullouts: [],
    transfers: [],
    deliveriesIntoBranch: [],
    orderLines: [],
    sales: { unavailable: false, byModel: new Map() },
  };
}

async function loadHistoricalFacts(
  tenantId: string,
  branchId: string,
  modelIds: string[],
  brandNames: Map<string, string>,
): Promise<WorksheetModelFact[]> {
  const [models, planogramRows] = await Promise.all([
    prisma.productModel.findMany({
      where: { tenantId, id: { in: modelIds } },
      select: {
        id: true,
        skuCode: true,
        name: true,
        status: true,
        srp: true,
        cbm: true,
        brandId: true,
        brand: { select: { id: true, name: true } },
        priceLists: {
          select: {
            amount: true,
            periodStart: true,
            periodEnd: true,
            packageTypeId: true,
          },
        },
      },
    }),
    prisma.branchPlanogram.findMany({
      where: { tenantId, branchId, modelId: { in: modelIds } },
      select: { modelId: true, maxQty: true },
    }),
  ]);

  const shelfByModel = new Map(planogramRows.map((row) => [row.modelId, row.maxQty] as const));
  return models.map((model) => {
    const shelfMax = shelfByModel.get(model.id);
    const onPlanogram = shelfMax != null;
    addBrand(brandNames, model.brandId, model.brand?.name ?? null);
    return {
      modelId: model.id,
      skuCode: model.skuCode,
      name: model.name,
      brandId: model.brandId,
      brandName: model.brand?.name ?? null,
      modelStatus: model.status,
      origin: "historical_order_line" as const,
      onPlanogram,
      shelfMax: onPlanogram ? shelfMax : null,
      srp: resolveActiveOrderPrice(model.priceLists, model.srp),
      cbm: decimalToNumber(model.cbm),
    };
  });
}

async function loadWorksheetFacts(
  tenantId: string,
  branchId: string,
  modelIds: string[],
  excludeOrderId: string | null | undefined,
  window: ReturnType<typeof manilaMonthWindow>,
) {
  const excludedStatuses: BranchOrderStatus[] = [...WORKSHEET_OUTSTANDING_EXCLUDED_STATUSES];
  const [inventoryRows, pulloutRows, transferRows, deliveryRows, orderRows, sales] =
    await Promise.all([
      prisma.branchInventory.findMany({
        where: {
          tenantId,
          branchId,
          serialNumber: { modelId: { in: modelIds } },
        },
        select: {
          serialNumberId: true,
          statusCode: { select: { code: true } },
          serialNumber: { select: { modelId: true } },
          defectReports: {
            where: { status: PENDING_DEFECT_INSPECTION },
            select: { id: true },
            take: 1,
          },
        },
      }),
      prisma.branchPulloutLine.findMany({
        where: {
          pullout: { tenantId, branchId },
          serialNumber: { modelId: { in: modelIds } },
        },
        select: {
          serialNumberId: true,
          serialNumber: { select: { modelId: true } },
          pullout: { select: { statusCode: { select: { code: true } } } },
        },
      }),
      prisma.branchTransferLine.findMany({
        where: {
          serialNumber: { modelId: { in: modelIds } },
          transfer: {
            tenantId,
            statusCode: { code: "in_transit" },
            OR: [{ fromBranchId: branchId }, { toBranchId: branchId }],
          },
        },
        select: {
          serialNumberId: true,
          transfer: { select: { fromBranchId: true, toBranchId: true } },
        },
      }),
      prisma.branchDeliveryLine.findMany({
        where: {
          serialNumber: { modelId: { in: modelIds } },
          delivery: {
            tenantId,
            branchId,
            statusCode: { code: { notIn: ["accepted", "rejected"] } },
          },
        },
        select: { serialNumberId: true },
      }),
      prisma.branchOrderDetail.findMany({
        where: {
          modelId: { in: modelIds },
          order: {
            tenantId,
            branchId,
            status: { notIn: excludedStatuses },
            ...(excludeOrderId ? { id: { not: excludeOrderId } } : {}),
          },
        },
        select: {
          modelId: true,
          quantity: true,
          approvedQty: true,
          order: {
            select: {
              deliveries: {
                select: {
                  lines: {
                    select: {
                      serialNumberId: true,
                      serialNumber: {
                        select: {
                          modelId: true,
                          branchInventories: {
                            where: { tenantId, branchId },
                            select: { statusCode: { select: { code: true } } },
                            take: 1,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      loadModelSales(tenantId, branchId, modelIds, window),
    ]);

  const serials: WorksheetSerialFact[] = inventoryRows.map((row) => ({
    serialNumberId: row.serialNumberId,
    modelId: row.serialNumber.modelId,
    statusCode: row.statusCode.code,
    pendingDefectInspection: row.defectReports.length > 0,
  }));

  const pullouts: WorksheetPulloutFact[] = pulloutRows.map((row) => ({
    serialNumberId: row.serialNumberId,
    modelId: row.serialNumber.modelId,
    workflowCode: row.pullout.statusCode.code,
  }));

  const transfers: WorksheetTransferFact[] = [];
  for (const row of transferRows) {
    if (row.transfer.fromBranchId === branchId) {
      transfers.push({ serialNumberId: row.serialNumberId, direction: "leaving" });
      continue;
    }
    if (row.transfer.toBranchId === branchId) {
      transfers.push({ serialNumberId: row.serialNumberId, direction: "entering" });
    }
  }

  const orderLines: WorksheetOrderLineFact[] = orderRows.map((row) => {
    const alreadyStk = new Set<string>();
    const linkedDit = new Set<string>();
    for (const delivery of row.order.deliveries) {
      for (const line of delivery.lines) {
        if (line.serialNumber.modelId !== row.modelId) continue;
        const code = line.serialNumber.branchInventories[0]?.statusCode.code;
        if (code === "STK") alreadyStk.add(line.serialNumberId);
        if (code === "DIT") linkedDit.add(line.serialNumberId);
      }
    }
    return {
      modelId: row.modelId,
      lineQty: row.approvedQty ?? row.quantity,
      serialsAlreadyStk: alreadyStk.size,
      linkedIncomingSerialIds: [...linkedDit],
    };
  });

  return {
    serials,
    pullouts,
    transfers,
    deliveriesIntoBranch: deliveryRows.map((row) => ({
      serialNumberId: row.serialNumberId,
    })),
    orderLines,
    sales,
  };
}

async function loadModelSales(
  tenantId: string,
  branchId: string,
  modelIds: string[],
  window: ReturnType<typeof manilaMonthWindow>,
): Promise<WorksheetSalesByModel> {
  if (modelIds.length === 0) {
    return { unavailable: false, byModel: new Map() };
  }

  try {
    const dateFilter = { gte: window.start, lt: window.endExclusive };
    const details = await prisma.branchSalesTransactionDetail.findMany({
      where: {
        AND: [
          salesListDetailWhere(tenantId),
          {
            sale: {
              branchId,
              OR: [
                { transactionDate: dateFilter },
                { AND: [{ transactionDate: null }, { createdAt: dateFilter }] },
              ],
            },
          },
          {
            OR: [{ modelId: { in: modelIds } }, { model: { id: { in: modelIds } } }],
          },
        ],
      },
      select: {
        modelId: true,
        saleAmount: true,
        amount: true,
        modelPrice: true,
        model: { select: { id: true, srp: true } },
      },
    });

    const byModel = new Map<string, { qty: number; amount: number }>();
    for (const detail of details) {
      const modelId = detail.modelId ?? detail.model?.id;
      if (!modelId || !modelIds.includes(modelId)) continue;
      const srp = decimalToNumber(detail.model?.srp);
      const saleAmt = decimalToNumber(detail.saleAmount || detail.amount || detail.modelPrice);
      const current = byModel.get(modelId) ?? { qty: 0, amount: 0 };
      current.qty += 1;
      current.amount += lineAmount(srp, saleAmt || null);
      byModel.set(modelId, current);
    }
    return { unavailable: false, byModel };
  } catch {
    return { unavailable: true };
  }
}
