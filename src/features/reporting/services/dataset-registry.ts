import {
  hasDashboardFullAccess,
  resolveDashboardCapabilities,
} from "@/features/dashboard/constants/dashboard-permissions";
import {
  getDashboardAnalytics,
  getDashboardKpis,
} from "@/features/dashboard/services/dashboard-kpi.service";
import { getDashboardSalesAnalytics } from "@/features/dashboard/services/dashboard-sales.service";
import {
  INVENTORY_REPORT_ACCESS,
  REPORT_ACCESS,
  SALES_REPORT_ACCESS,
  TRANSFER_REPORT_ACCESS,
} from "@/features/reports/constants/report-access";
import { dailyStockReportService } from "@/features/reports/services/daily-stock-report.service";
import { buildInventoryReportRows } from "@/features/reports/services/inventory-report.service";
import { processedOrdersReportService } from "@/features/reports/services/processed-orders-report.service";
import { salesReportService } from "@/features/reports/services/sales-report.service";
import { transferReportService } from "@/features/reports/services/transfer-report.service";
import {
  DATASET_CATALOG,
  type DatasetKey,
  type DatasetRow,
} from "@/features/reporting/datasets/dataset-catalog";
import type { DatasetParams } from "@/features/reporting/schemas/dataset-params.schema";
import { canAccessReturns } from "@/features/returns/constants/returns-permissions";
import { canAccessSales } from "@/features/sales/constants/sales-permissions";
import { getUserBranchIds } from "@/lib/aor/scope";
import type { KpiStatusCount } from "@/lib/kpi-cards/types";

/**
 * Caps each dataset response. Server action payloads stay under the 4.5 MB
 * Vercel response limit and custom dashboards cannot pull whole tables.
 */
export const MAX_DATASET_ROWS = 10_000;

export interface DatasetContext {
  tenantId: string;
  userId: string;
  permissions: string[];
}

export class DatasetAccessError extends Error {}

interface DatasetDefinition {
  canAccess: (permissions: string[]) => boolean;
  load: (ctx: DatasetContext, params: DatasetParams) => Promise<DatasetRow[]>;
}

const anyOf =
  (required: readonly string[]) =>
  (permissions: string[]): boolean =>
    required.some((p) => permissions.includes(p));

const canSeeOps = (permissions: string[]) => resolveDashboardCapabilities(permissions).hasOps;
const canSeeSalesAnalytics = (permissions: string[]) =>
  canAccessSales(permissions) || canAccessReturns(permissions);

/** Same branch rule as the report exports: no AOR rows → empty list. */
async function reportBranchIds(ctx: DatasetContext): Promise<string[]> {
  return (await getUserBranchIds(ctx.tenantId, ctx.userId)) ?? [];
}

/** Narrows to the requested branch, refusing branches outside the caller's AOR. */
async function scopedBranchIds(ctx: DatasetContext, params: DatasetParams): Promise<string[]> {
  const aorIds = await reportBranchIds(ctx);
  if (!params.branchId) return aorIds;
  if (aorIds.length > 0 && !aorIds.includes(params.branchId)) {
    throw new DatasetAccessError("Branch is outside your assigned area");
  }
  return [params.branchId];
}

function startOfDay(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function endOfDay(value: string): Date {
  return new Date(`${value}T23:59:59.999Z`);
}

function dateRange(params: DatasetParams) {
  return {
    from: params.from ? startOfDay(params.from) : undefined,
    to: params.to ? endOfDay(params.to) : undefined,
  };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Maps positional rows (inventory workbook shape) onto catalog column names. */
function rowsFromCells(key: DatasetKey, cells: (string | number | null | undefined)[][]): DatasetRow[] {
  const columns = DATASET_CATALOG[key].columns;
  return cells.map((cell) =>
    Object.fromEntries(columns.map((column, i) => [column.name, cell[i] ?? null])),
  );
}

/**
 * Report row interfaces are flat string/number/null records; TypeScript just
 * can't see an index signature on a named interface.
 */
function asRows<T extends { [K in keyof T]: string | number | null }>(rows: T[]): DatasetRow[] {
  return rows as unknown as DatasetRow[];
}

function statusRows(items: KpiStatusCount[]): DatasetRow[] {
  return items.map((s) => ({ code: s.code, name: s.name, count: s.count }));
}

async function loadInventoryRows(ctx: DatasetContext, params: DatasetParams) {
  return buildInventoryReportRows(ctx.tenantId, {
    ...dateRange(params),
    branchIds: await scopedBranchIds(ctx, params),
    sku: params.sku || undefined,
    // Same default as the inventory export: omitted → STK only.
    statusCodes: params.statusCodes ?? ["STK"],
  });
}

async function loadSalesAnalytics(ctx: DatasetContext) {
  return getDashboardSalesAnalytics(ctx.tenantId, ctx.userId, hasDashboardFullAccess(ctx.permissions));
}

const DATASETS: Record<DatasetKey, DatasetDefinition> = {
  sales_lines: {
    canAccess: anyOf(SALES_REPORT_ACCESS),
    load: async (ctx, params) =>
      asRows(await salesReportService.listRows(ctx.tenantId, {
        ...dateRange(params),
        branchIds: await scopedBranchIds(ctx, params),
      })),
  },
  transfers: {
    canAccess: anyOf(TRANSFER_REPORT_ACCESS),
    load: async (ctx, params) =>
      asRows(await transferReportService.listRows(ctx.tenantId, {
        ...dateRange(params),
        branchIds: await scopedBranchIds(ctx, params),
      })),
  },
  processed_orders: {
    canAccess: anyOf(REPORT_ACCESS),
    load: async (ctx, params) => {
      const { from, to } = dateRange(params);
      return asRows(await processedOrdersReportService.listRows(ctx.tenantId, {
        processedFrom: from,
        processedTo: to,
        branchIds: await scopedBranchIds(ctx, params),
      }));
    },
  },
  daily_stock: {
    canAccess: anyOf(REPORT_ACCESS),
    load: async (ctx, params) =>
      asRows(await dailyStockReportService.listRows(ctx.tenantId, {
        date: new Date(params.date ?? todayIso()),
        branchIds: await scopedBranchIds(ctx, params),
      })),
  },
  inventory_detail: {
    canAccess: anyOf(INVENTORY_REPORT_ACCESS),
    load: async (ctx, params) =>
      rowsFromCells("inventory_detail", (await loadInventoryRows(ctx, params)).detailRows),
  },
  inventory_summary: {
    canAccess: anyOf(INVENTORY_REPORT_ACCESS),
    load: async (ctx, params) =>
      rowsFromCells("inventory_summary", (await loadInventoryRows(ctx, params)).summaryRows),
  },
  ops_kpis: {
    canAccess: canSeeOps,
    load: async (ctx) => {
      const fullAccess = hasDashboardFullAccess(ctx.permissions);
      const [kpis, analytics] = await Promise.all([
        getDashboardKpis(ctx.tenantId, ctx.userId, fullAccess),
        getDashboardAnalytics(ctx.tenantId, ctx.userId, fullAccess),
      ]);
      return [
        {
          pendingOrderApprovals: kpis.pendingOrderApprovals,
          deliveryInTransit: kpis.deliveryInTransit,
          stockCount: kpis.stockCount,
          openAtr: kpis.openAtr,
          belowPlanogramCapacity: kpis.belowPlanogramCapacity,
          milBreaches: kpis.milBreaches,
          allocationGapCount: kpis.allocationGapCount,
          draftSuggestedOrders: kpis.draftSuggestedOrders,
          ordersThisMonth: analytics.periodSnapshot.ordersThisMonth,
          salesThisMonth: analytics.periodSnapshot.salesThisMonth,
        },
      ];
    },
  },
  inventory_by_status: {
    canAccess: canSeeOps,
    load: async (ctx) =>
      statusRows(
        (await getDashboardAnalytics(ctx.tenantId, ctx.userId, hasDashboardFullAccess(ctx.permissions)))
          .inventoryByStatus,
      ),
  },
  orders_by_status: {
    canAccess: canSeeOps,
    load: async (ctx) =>
      statusRows(
        (await getDashboardAnalytics(ctx.tenantId, ctx.userId, hasDashboardFullAccess(ctx.permissions)))
          .ordersByStatus,
      ),
  },
  sales_kpis: {
    canAccess: canSeeSalesAnalytics,
    load: async (ctx) => {
      const { kpis } = await loadSalesAnalytics(ctx);
      return [{ ...kpis }];
    },
  },
  sale_status_mix: {
    canAccess: canSeeSalesAnalytics,
    load: async (ctx) => statusRows((await loadSalesAnalytics(ctx)).saleStatusMix),
  },
  atr_return_pipeline: {
    canAccess: canSeeSalesAnalytics,
    load: async (ctx) => statusRows((await loadSalesAnalytics(ctx)).atrReturnPipeline),
  },
  top_branches: {
    canAccess: canSeeSalesAnalytics,
    load: async (ctx) =>
      (await loadSalesAnalytics(ctx)).topBranches.map((r) => ({ name: r.name, value: r.value })),
  },
  top_models: {
    canAccess: canSeeSalesAnalytics,
    load: async (ctx) =>
      (await loadSalesAnalytics(ctx)).topModels.map((r) => ({ name: r.name, value: r.value })),
  },
};

/** Stimulsoft parses DateTime columns; blank strings must arrive as null. */
function normalizeDateCells(key: DatasetKey, rows: DatasetRow[]): DatasetRow[] {
  const dateColumns = DATASET_CATALOG[key].columns.filter((c) => c.type === "date").map((c) => c.name);
  if (dateColumns.length === 0) return rows;
  return rows.map((row) => {
    const next = { ...row };
    for (const name of dateColumns) if (next[name] === "") next[name] = null;
    return next;
  });
}

export function canAccessDataset(key: DatasetKey, permissions: string[]): boolean {
  return DATASETS[key].canAccess(permissions);
}

export function listAccessibleDatasetKeys(permissions: string[]): DatasetKey[] {
  return (Object.keys(DATASETS) as DatasetKey[]).filter((key) => canAccessDataset(key, permissions));
}

export interface LoadedDataset {
  rows: DatasetRow[];
  /** True when rows were cut at MAX_DATASET_ROWS. */
  truncated: boolean;
}

/** Loads one dataset after re-checking access. Throws DatasetAccessError when denied. */
export async function loadDataset(
  key: DatasetKey,
  ctx: DatasetContext,
  params: DatasetParams,
): Promise<LoadedDataset> {
  if (!canAccessDataset(key, ctx.permissions)) {
    throw new DatasetAccessError(`No access to dataset ${key}`);
  }
  const rows = await DATASETS[key].load(ctx, params);
  return {
    rows: normalizeDateCells(key, rows.length > MAX_DATASET_ROWS ? rows.slice(0, MAX_DATASET_ROWS) : rows),
    truncated: rows.length > MAX_DATASET_ROWS,
  };
}
