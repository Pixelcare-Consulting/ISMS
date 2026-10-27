/**
 * Pure order-worksheet rules. No database access.
 * SUG is shelf max minus STK. DII is stock value divided by Manila daily sales.
 */

import type { BranchOrderType, SkuStatus } from "@prisma/client";

import type { ManilaMonthWindow } from "@/features/orders/utils/manila-calendar";
import {
  NO_SALES_DII_REASON,
  OFF_PLANOGRAM_SUGGESTION_REASON,
  WORKSHEET_INVENTORY_AMOUNT_BASIS,
  WORKSHEET_SALES_TIME_ZONE,
  type OrderAnalyticsBrand,
  type OrderInventoryStatusCount,
  type OrderWorksheetBrandQuota,
  type OrderWorksheetInput,
  type OrderWorksheetInventory,
  type OrderWorksheetLine,
  type OrderWorksheetModelOrigin,
  type OrderWorksheetPayload,
  type OrderWorksheetSummary,
  type WorksheetTransitDirection,
} from "@/features/orders/types/order-analytics";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const INV_CODE_ORDER = ["STK", "DIT", "RSV", "DEF", "SLD", "OFS"] as const;

/** Used when a model has no branch MIL setting. Same fallback as order analytics. */
export const WORKSHEET_DEFAULT_MIL_DAYS = 30;

/** Pull-out workflows that are no longer waiting at the branch. */
export const AWAITING_PULLOUT_EXCLUDED_WORKFLOWS = [
  "cancelled",
  "completed",
  "pulled_out",
  "in_transit",
] as const;

const AWAITING_PULLOUT_EXCLUDED = new Set<string>(AWAITING_PULLOUT_EXCLUDED_WORKFLOWS);

/** Drafts are not committed supply. Rejected and cancelled orders are closed. */
export const WORKSHEET_OUTSTANDING_EXCLUDED_STATUSES = [
  "draft",
  "rejected",
  "cancelled",
] as const;

export interface WorksheetModelFact {
  modelId: string;
  skuCode: string;
  name: string;
  brandId: string | null;
  brandName: string | null;
  modelStatus: SkuStatus;
  origin: OrderWorksheetModelOrigin;
  onPlanogram: boolean;
  shelfMax: number | null;
  srp: number;
  cbm: number;
}

export interface WorksheetSerialFact {
  serialNumberId: string;
  modelId: string;
  statusCode: string;
  pendingDefectInspection: boolean;
}

export interface WorksheetPulloutFact {
  serialNumberId: string;
  modelId: string;
  workflowCode: string;
}

export interface WorksheetTransferFact {
  serialNumberId: string;
  direction: "leaving" | "entering";
}

export interface WorksheetOrderLineFact {
  modelId: string;
  lineQty: number;
  serialsAlreadyStk: number;
  linkedIncomingSerialIds: readonly string[];
}

export type WorksheetSalesByModel =
  | { unavailable: true }
  | {
      unavailable: false;
      byModel: ReadonlyMap<string, { qty: number; amount: number }>;
    };

export interface ClassifiedModelInventory extends OrderWorksheetInventory {
  incomingSerialIds: readonly string[];
}

export function isAwaitingPulloutWorkflow(workflowCode: string): boolean {
  return !AWAITING_PULLOUT_EXCLUDED.has(workflowCode);
}

export function formatWorksheetSalesPeriodLabel(window: ManilaMonthWindow): string {
  const monthName = MONTH_NAMES[window.month - 1] ?? "Unknown";
  return `${monthName} 1\u2013${window.day}, ${window.year} (${WORKSHEET_SALES_TIME_ZONE})`;
}

/**
 * Shelf gap. Off-planogram has no suggestion.
 * Incoming and outstanding quantities are not inputs.
 */
export function worksheetSuggestion(input: {
  onPlanogram: boolean;
  shelfMax: number | null;
  onHandQty: number;
}): { sugQty: number | null; suggestionUnavailableReason: string | null } {
  if (!input.onPlanogram || input.shelfMax == null) {
    return {
      sugQty: null,
      suggestionUnavailableReason: OFF_PLANOGRAM_SUGGESTION_REASON,
    };
  }
  return {
    sugQty: Math.max(0, input.shelfMax - input.onHandQty),
    suggestionUnavailableReason: null,
  };
}

/**
 * Stock value at selling price divided by month-to-date daily sales.
 * A failed sales query is not treated as zero sales.
 */
export function worksheetDii(input: {
  inventoryAmount: number;
  salesAmount: number | null;
  salesUnavailable: boolean;
  daysElapsed: number;
}): Pick<OrderWorksheetSummary, "computedDii" | "diiUnavailableReason"> {
  if (input.salesUnavailable || input.salesAmount == null) {
    return { computedDii: null, diiUnavailableReason: null };
  }
  if (input.salesAmount <= 0) {
    return { computedDii: null, diiUnavailableReason: NO_SALES_DII_REASON };
  }
  const days = input.daysElapsed > 0 ? input.daysElapsed : 1;
  const dailySales = input.salesAmount / days;
  if (dailySales <= 0) {
    return { computedDii: null, diiUnavailableReason: NO_SALES_DII_REASON };
  }
  return {
    computedDii: input.inventoryAmount / dailySales,
    diiUnavailableReason: null,
  };
}

/**
 * Most common MIL days. Ties keep the smaller number.
 * An empty list has no target.
 */
export function usualMilDays(days: readonly number[]): number | null {
  if (days.length === 0) return null;
  const counts = new Map<number, number>();
  for (const value of days) {
    if (!Number.isFinite(value)) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (best == null || count > bestCount || (count === bestCount && value < best)) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

export interface WorksheetSalesLine {
  brandId: string | null;
  salesQty: number | null;
  salesUnavailable: boolean;
}

/**
 * Month-to-date sales quantity for each brand.
 * A failed sales query makes that brand's total unavailable.
 */
export function worksheetBrandSalesQty(
  lines: readonly WorksheetSalesLine[],
): ReadonlyMap<string, number | null> {
  const groups = new Map<string, { qty: number; unavailable: boolean }>();
  for (const line of lines) {
    const key = line.brandId ?? "";
    const current = groups.get(key) ?? { qty: 0, unavailable: false };
    if (line.salesUnavailable || line.salesQty == null) {
      current.unavailable = true;
    } else {
      current.qty += line.salesQty;
    }
    groups.set(key, current);
  }
  const result = new Map<string, number | null>();
  for (const [key, value] of groups) {
    result.set(key, value.unavailable ? null : value.qty);
  }
  return result;
}

/** Model month-to-date sales divided by that brand's month-to-date sales. */
export function worksheetModelRate(
  salesQty: number | null,
  salesUnavailable: boolean,
  brandSalesQty: number | null,
): number | null {
  if (salesUnavailable || salesQty == null || brandSalesQty == null || brandSalesQty <= 0) {
    return null;
  }
  return salesQty / brandSalesQty;
}

export interface WorksheetPlanningFigureLine {
  brandId: string | null;
  srp: number;
  cbm: number;
  salesAmount: number | null;
  salesUnavailable: boolean;
  milDays: number;
  onPlanogram: boolean;
  onHandQty: number;
  requestedQty: number;
  approvedQty: number | null;
}

export interface WorksheetPlanningFigures {
  quotaQty: number | null;
  computedDii: number | null;
  diiUnavailableReason: typeof NO_SALES_DII_REASON | null;
  salesUnavailable: boolean;
  inventoryAmount: number;
  targetDiiDays: number | null;
  approvedOrderAmount: number;
  totalInventoryAmount: number;
  totalCbm: number;
}

/**
 * Brand-scoped planning figures.
 * Pass every worksheet line. Search and "with a quantity" stay outside this function.
 * An empty brand id uses every line.
 */
export function worksheetPlanningFigures(input: {
  lines: readonly WorksheetPlanningFigureLine[];
  brandId: string | null;
  brandQuotas: readonly OrderWorksheetBrandQuota[];
  daysElapsed: number;
}): WorksheetPlanningFigures {
  const brandId = input.brandId?.trim() ? input.brandId.trim() : null;
  const scoped = input.lines.filter((line) => !brandId || line.brandId === brandId);
  let inventoryAmount = 0;
  let approvedOrderAmount = 0;
  let totalCbm = 0;
  let salesUnavailable = false;
  let salesAmount = 0;
  for (const line of scoped) {
    const onHand = Number.isFinite(line.onHandQty) ? line.onHandQty : 0;
    const price = Number.isFinite(line.srp) ? line.srp : 0;
    inventoryAmount += onHand * price;
    if (line.approvedQty != null && line.approvedQty > 0) {
      approvedOrderAmount += line.approvedQty * price;
    }
    if (line.requestedQty > 0) {
      const unitCbm = Number.isFinite(line.cbm) ? line.cbm : 0;
      totalCbm += line.requestedQty * unitCbm;
    }
    if (line.salesUnavailable || line.salesAmount == null) {
      salesUnavailable = true;
    } else {
      salesAmount += line.salesAmount;
    }
  }
  const dii = worksheetDii({
    inventoryAmount,
    salesAmount: salesUnavailable ? null : salesAmount,
    salesUnavailable,
    daysElapsed: input.daysElapsed,
  });
  const planogramDays = scoped.filter((line) => line.onPlanogram).map((line) => line.milDays);
  const targetDays = planogramDays.length > 0 ? planogramDays : scoped.map((line) => line.milDays);
  return {
    quotaQty: quotaQuantity(input.brandQuotas, brandId),
    computedDii: dii.computedDii,
    diiUnavailableReason: dii.diiUnavailableReason,
    salesUnavailable,
    inventoryAmount,
    targetDiiDays: usualMilDays(targetDays),
    approvedOrderAmount,
    totalInventoryAmount: inventoryAmount + approvedOrderAmount,
    totalCbm,
  };
}

function quotaQuantity(
  quotas: readonly OrderWorksheetBrandQuota[],
  brandId: string | null,
): number | null {
  const matched = brandId ? quotas.filter((row) => row.brandId === brandId) : quotas;
  if (matched.length === 0) return null;
  return matched.reduce((sum, row) => sum + (Number.isFinite(row.quantity) ? row.quantity : 0), 0);
}

export function resolveDitDirection(input: {
  onInTransitPullout: boolean;
  transferLeaving: boolean;
  deliveryIntoBranch: boolean;
  transferEntering: boolean;
}): WorksheetTransitDirection {
  if (input.onInTransitPullout || input.transferLeaving) return "outgoing";
  if (input.deliveryIntoBranch || input.transferEntering) return "incoming";
  return "unclassified";
}

export function outstandingQtyForLines(
  lines: readonly Pick<
    WorksheetOrderLineFact,
    "lineQty" | "serialsAlreadyStk" | "linkedIncomingSerialIds"
  >[],
  incomingSerialIds: ReadonlySet<string>,
): number {
  let total = 0;
  for (const line of lines) {
    const linked = new Set(line.linkedIncomingSerialIds);
    let linkedIncoming = 0;
    for (const serialNumberId of linked) {
      if (incomingSerialIds.has(serialNumberId)) linkedIncoming += 1;
    }
    total += Math.max(0, line.lineQty - line.serialsAlreadyStk - linkedIncoming);
  }
  return total;
}

function emptyClassification(): ClassifiedModelInventory {
  return {
    onHandQty: 0,
    availableToSellQty: 0,
    defectiveQty: 0,
    awaitingPulloutQty: 0,
    transitIncomingQty: 0,
    transitOutgoingQty: 0,
    transitUnclassifiedQty: 0,
    ditQty: 0,
    byStatus: [],
    incomingSerialIds: [],
  };
}

function worksheetInventoryChips(counts: Map<string, number>): OrderInventoryStatusCount[] {
  const codes = new Set<string>([...INV_CODE_ORDER, ...counts.keys()]);
  return [...codes]
    .filter((code) => code === "STK" || (counts.get(code) ?? 0) > 0)
    .sort((a, b) => {
      const ai = INV_CODE_ORDER.indexOf(a as (typeof INV_CODE_ORDER)[number]);
      const bi = INV_CODE_ORDER.indexOf(b as (typeof INV_CODE_ORDER)[number]);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    })
    .map((code) => ({ code, count: counts.get(code) ?? 0 }));
}

function addTransit(
  row: {
    transitIncomingQty: number;
    transitOutgoingQty: number;
    transitUnclassifiedQty: number;
    incomingSerialIds: string[];
  },
  direction: WorksheetTransitDirection,
  serialNumberId: string,
): void {
  switch (direction) {
    case "outgoing":
      row.transitOutgoingQty += 1;
      return;
    case "incoming":
      row.transitIncomingQty += 1;
      row.incomingSerialIds.push(serialNumberId);
      return;
    case "unclassified":
      row.transitUnclassifiedQty += 1;
      return;
    default: {
      const _exhaustive: never = direction;
      throw new Error(`Unhandled transit direction: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Classify distinct branch serials.
 * On hand is STK only — planning display units are not a serial status and are not added.
 * Defective is status DEF. Awaiting pull-out is a separate set and is not added to DEF.
 */
export function classifyWorksheetInventory(input: {
  modelIds: readonly string[];
  serials: readonly WorksheetSerialFact[];
  pullouts: readonly WorksheetPulloutFact[];
  transfers: readonly WorksheetTransferFact[];
  deliveriesIntoBranch: readonly { serialNumberId: string }[];
}): Map<string, ClassifiedModelInventory> {
  const orderedModelIds: string[] = [];
  const modelIds = new Set<string>();
  for (const modelId of input.modelIds) {
    if (modelIds.has(modelId)) continue;
    modelIds.add(modelId);
    orderedModelIds.push(modelId);
  }

  const leaving = new Set<string>();
  const entering = new Set<string>();
  for (const transfer of input.transfers) {
    switch (transfer.direction) {
      case "leaving":
        leaving.add(transfer.serialNumberId);
        break;
      case "entering":
        entering.add(transfer.serialNumberId);
        break;
      default: {
        const _exhaustive: never = transfer.direction;
        throw new Error(`Unhandled transfer direction: ${String(_exhaustive)}`);
      }
    }
  }

  const deliverySerials = new Set(
    input.deliveriesIntoBranch.map((row) => row.serialNumberId),
  );
  const inTransitPullout = new Set<string>();
  for (const line of input.pullouts) {
    if (!modelIds.has(line.modelId)) continue;
    if (line.workflowCode === "in_transit") inTransitPullout.add(line.serialNumberId);
  }
  const awaitingByModel = new Map<string, Set<string>>();
  for (const line of input.pullouts) {
    if (!modelIds.has(line.modelId)) continue;
    if (inTransitPullout.has(line.serialNumberId)) continue;
    if (!isAwaitingPulloutWorkflow(line.workflowCode)) continue;
    const serials = awaitingByModel.get(line.modelId) ?? new Set<string>();
    serials.add(line.serialNumberId);
    awaitingByModel.set(line.modelId, serials);
  }

  const counts = new Map<string, Map<string, number>>();
  const incomingIds = new Map<string, string[]>();
  const tallies = new Map<
    string,
    {
      onHandQty: number;
      availableToSellQty: number;
      defectiveQty: number;
      transitIncomingQty: number;
      transitOutgoingQty: number;
      transitUnclassifiedQty: number;
    }
  >();

  for (const modelId of orderedModelIds) {
    counts.set(modelId, new Map());
    incomingIds.set(modelId, []);
    tallies.set(modelId, {
      onHandQty: 0,
      availableToSellQty: 0,
      defectiveQty: 0,
      transitIncomingQty: 0,
      transitOutgoingQty: 0,
      transitUnclassifiedQty: 0,
    });
  }

  const seenSerials = new Set<string>();
  for (const serial of input.serials) {
    if (!modelIds.has(serial.modelId) || seenSerials.has(serial.serialNumberId)) continue;
    seenSerials.add(serial.serialNumberId);
    const tally = tallies.get(serial.modelId);
    const statusCounts = counts.get(serial.modelId);
    if (!tally || !statusCounts) continue;

    const code = serial.statusCode || "OTHER";
    statusCounts.set(code, (statusCounts.get(code) ?? 0) + 1);

    if (code === "STK") {
      tally.onHandQty += 1;
      if (!serial.pendingDefectInspection) tally.availableToSellQty += 1;
    }
    if (code === "DEF") tally.defectiveQty += 1;
    if (code === "DIT") {
      const bucket = {
        transitIncomingQty: tally.transitIncomingQty,
        transitOutgoingQty: tally.transitOutgoingQty,
        transitUnclassifiedQty: tally.transitUnclassifiedQty,
        incomingSerialIds: incomingIds.get(serial.modelId) ?? [],
      };
      addTransit(
        bucket,
        resolveDitDirection({
          onInTransitPullout: inTransitPullout.has(serial.serialNumberId),
          transferLeaving: leaving.has(serial.serialNumberId),
          deliveryIntoBranch: deliverySerials.has(serial.serialNumberId),
          transferEntering: entering.has(serial.serialNumberId),
        }),
        serial.serialNumberId,
      );
      tally.transitIncomingQty = bucket.transitIncomingQty;
      tally.transitOutgoingQty = bucket.transitOutgoingQty;
      tally.transitUnclassifiedQty = bucket.transitUnclassifiedQty;
      incomingIds.set(serial.modelId, bucket.incomingSerialIds);
    }
  }

  const result = new Map<string, ClassifiedModelInventory>();
  for (const modelId of orderedModelIds) {
    const tally = tallies.get(modelId) ?? emptyClassification();
    const statusCounts = counts.get(modelId) ?? new Map<string, number>();
    const incomingSerialIds = incomingIds.get(modelId) ?? [];
    result.set(modelId, {
      onHandQty: tally.onHandQty,
      availableToSellQty: tally.availableToSellQty,
      defectiveQty: tally.defectiveQty,
      awaitingPulloutQty: awaitingByModel.get(modelId)?.size ?? 0,
      transitIncomingQty: tally.transitIncomingQty,
      transitOutgoingQty: tally.transitOutgoingQty,
      transitUnclassifiedQty: tally.transitUnclassifiedQty,
      ditQty:
        tally.transitIncomingQty +
        tally.transitOutgoingQty +
        tally.transitUnclassifiedQty,
      byStatus: worksheetInventoryChips(statusCounts),
      incomingSerialIds,
    });
  }
  return result;
}

function applyStatusColors(
  chips: OrderInventoryStatusCount[],
  colors: ReadonlyMap<string, string | null> | undefined,
): OrderInventoryStatusCount[] {
  if (!colors) return chips;
  return chips.map((chip) => ({
    code: chip.code,
    count: chip.count,
    color: colors.get(chip.code) ?? null,
  }));
}

function normalizeFrequencyCode(code: string | null | undefined): string | null {
  const trimmed = code?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeBrandQuotas(
  quotas: readonly OrderWorksheetBrandQuota[] | undefined,
): OrderWorksheetBrandQuota[] {
  if (!quotas) return [];
  const result: OrderWorksheetBrandQuota[] = [];
  for (const quota of quotas) {
    const brandId = quota.brandId.trim();
    if (!brandId || !Number.isFinite(quota.quantity)) continue;
    result.push({ brandId, quantity: quota.quantity });
  }
  return result;
}

function salesForModel(
  sales: WorksheetSalesByModel,
  modelId: string,
): { salesQty: number | null; salesAmount: number | null; salesUnavailable: boolean } {
  if (sales.unavailable) {
    return { salesQty: null, salesAmount: null, salesUnavailable: true };
  }
  const row = sales.byModel.get(modelId) ?? { qty: 0, amount: 0 };
  return { salesQty: row.qty, salesAmount: row.amount, salesUnavailable: false };
}

function scopeLabels(input: {
  branchName: string;
  brandFiltered: boolean;
  brandName: string | null;
  offBrandRowCount: number;
}): Pick<
  OrderWorksheetSummary,
  "branchScopeLabel" | "brandScopeLabel" | "metricScopeLabel"
> {
  const branchScopeLabel = input.branchName;
  const brandScopeLabel = input.brandFiltered
    ? (input.brandName ?? "Selected brand")
    : "All brands";
  const historicalNote =
    input.offBrandRowCount > 0 ? " · includes models already on the order" : "";
  return {
    branchScopeLabel,
    brandScopeLabel,
    metricScopeLabel: `${branchScopeLabel} · ${brandScopeLabel}${historicalNote}`,
  };
}

export function assembleOrderWorksheet(input: {
  branch: {
    id: string;
    name: string;
    dealerId: string | null;
    dealerName: string | null;
  };
  orderType: BranchOrderType;
  brandId: string | null;
  brandName: string | null;
  brands: readonly OrderAnalyticsBrand[];
  models: readonly WorksheetModelFact[];
  serials: readonly WorksheetSerialFact[];
  pullouts: readonly WorksheetPulloutFact[];
  transfers: readonly WorksheetTransferFact[];
  deliveriesIntoBranch: readonly { serialNumberId: string }[];
  orderLines: readonly WorksheetOrderLineFact[];
  sales: WorksheetSalesByModel;
  window: ManilaMonthWindow;
  inventoryAsOf: string;
  /** Branch delivery schedule code. Omitted callers stay blank. */
  deliveryFrequencyCode?: string | null;
  /** Current-month quotas. Omitted callers stay empty. */
  brandQuotas?: readonly OrderWorksheetBrandQuota[];
  /** Branch MIL settings. Models without one use the usual 30 days. */
  milDaysByModel?: ReadonlyMap<string, number>;
  /** Inventory status palette. Omitted callers leave chip color unset. */
  statusColors?: ReadonlyMap<string, string | null>;
}): OrderWorksheetPayload {
  const brandFiltered = input.brandId != null;
  const classified = classifyWorksheetInventory({
    modelIds: input.models.map((model) => model.modelId),
    serials: input.serials,
    pullouts: input.pullouts,
    transfers: input.transfers,
    deliveriesIntoBranch: input.deliveriesIntoBranch,
  });

  const ordersByModel = new Map<string, WorksheetOrderLineFact[]>();
  for (const line of input.orderLines) {
    const list = ordersByModel.get(line.modelId) ?? [];
    list.push(line);
    ordersByModel.set(line.modelId, list);
  }

  const lines: OrderWorksheetLine[] = input.models
    .map((model) => {
      const inventory = classified.get(model.modelId) ?? emptyClassification();
      const suggestion = worksheetSuggestion({
        onPlanogram: model.onPlanogram,
        shelfMax: model.shelfMax,
        onHandQty: inventory.onHandQty,
      });
      const sales = salesForModel(input.sales, model.modelId);
      const incomingSerialIds = new Set(inventory.incomingSerialIds);
      const configuredMil = input.milDaysByModel?.get(model.modelId);
      return {
        modelId: model.modelId,
        skuCode: model.skuCode,
        name: model.name,
        brandId: model.brandId,
        brandName: model.brandName,
        modelStatus: model.modelStatus,
        origin: model.origin,
        newlyOrderable:
          model.origin === "planogram" &&
          model.modelStatus === "active" &&
          model.onPlanogram,
        onPlanogram: model.onPlanogram,
        matchesBrandFilter: !brandFiltered || model.brandId === input.brandId,
        shelfMax: model.shelfMax,
        srp: model.srp,
        cbm: model.cbm,
        inventory: {
          onHandQty: inventory.onHandQty,
          availableToSellQty: inventory.availableToSellQty,
          defectiveQty: inventory.defectiveQty,
          awaitingPulloutQty: inventory.awaitingPulloutQty,
          transitIncomingQty: inventory.transitIncomingQty,
          transitOutgoingQty: inventory.transitOutgoingQty,
          transitUnclassifiedQty: inventory.transitUnclassifiedQty,
          ditQty: inventory.ditQty,
          byStatus: applyStatusColors(inventory.byStatus, input.statusColors),
        },
        milDays:
          configuredMil != null && Number.isFinite(configuredMil)
            ? configuredMil
            : WORKSHEET_DEFAULT_MIL_DAYS,
        salesQty: sales.salesQty,
        salesAmount: sales.salesAmount,
        salesUnavailable: sales.salesUnavailable,
        sugQty: suggestion.sugQty,
        suggestionUnavailableReason: suggestion.suggestionUnavailableReason,
        incomingQty: inventory.transitIncomingQty,
        outstandingOrderQty: outstandingQtyForLines(
          ordersByModel.get(model.modelId) ?? [],
          incomingSerialIds,
        ),
      };
    })
    .sort((a, b) => a.skuCode.localeCompare(b.skuCode) || a.modelId.localeCompare(b.modelId));

  const salesUnavailable = input.sales.unavailable;
  const salesQty = salesUnavailable
    ? null
    : lines.reduce((sum, line) => sum + (line.salesQty ?? 0), 0);
  const salesAmount = salesUnavailable
    ? null
    : lines.reduce((sum, line) => sum + (line.salesAmount ?? 0), 0);
  const inventoryAmount = lines.reduce(
    (sum, line) => sum + line.inventory.onHandQty * line.srp,
    0,
  );
  const dii = worksheetDii({
    inventoryAmount,
    salesAmount,
    salesUnavailable,
    daysElapsed: input.window.daysElapsed,
  });
  const offBrandRowCount = lines.filter((line) => !line.matchesBrandFilter).length;
  const labels = scopeLabels({
    branchName: input.branch.name,
    brandFiltered,
    brandName: input.brandName,
    offBrandRowCount,
  });

  return {
    branchId: input.branch.id,
    branchName: input.branch.name,
    dealerId: input.branch.dealerId,
    dealerName: input.branch.dealerName,
    brands: [...input.brands],
    brandId: input.brandId,
    orderType: input.orderType,
    deliveryFrequencyCode: normalizeFrequencyCode(input.deliveryFrequencyCode),
    brandQuotas: normalizeBrandQuotas(input.brandQuotas),
    lines,
    summary: {
      branchId: input.branch.id,
      branchName: input.branch.name,
      brandId: input.brandId,
      brandName: input.brandName,
      brandFiltered,
      ...labels,
      includesHistoricalOrderLines: lines.some(
        (line) => line.origin === "historical_order_line",
      ),
      offBrandRowCount,
      salesTimeZone: WORKSHEET_SALES_TIME_ZONE,
      salesPeriodLabel: formatWorksheetSalesPeriodLabel(input.window),
      inventoryAsOf: input.inventoryAsOf,
      daysElapsed: input.window.daysElapsed,
      computedDii: dii.computedDii,
      diiUnavailableReason: dii.diiUnavailableReason,
      inventoryAmount,
      inventoryAmountBasis: WORKSHEET_INVENTORY_AMOUNT_BASIS,
      salesQty,
      salesAmount,
      salesUnavailable,
    },
  };
}

export type OrderWorksheetLoadOptions = OrderWorksheetInput & { now?: Date };
