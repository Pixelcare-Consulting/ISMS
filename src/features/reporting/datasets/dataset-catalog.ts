/**
 * Dataset catalog for Stimulsoft reports and dashboards.
 *
 * Pure metadata (no server imports): shared by the server registry, the
 * client viewer/designer and `tools/stimulsoft/build-templates.ts`, so
 * template dictionaries and runtime JSON always agree on names and types.
 */

export type DatasetColumnType = "string" | "number" | "date";

export interface DatasetColumn {
  name: string;
  label: string;
  type: DatasetColumnType;
}

export interface DatasetMeta {
  label: string;
  description: string;
  /**
   * Whether a dashboard's From/To range applies. Point-in-time datasets
   * (current stock, KPI snapshots) ignore it so a dashboard date picker
   * doesn't silently hide current stock.
   */
  dashboardDateRange: boolean;
  columns: readonly DatasetColumn[];
}

const str = (name: string, label: string): DatasetColumn => ({ name, label, type: "string" });
const num = (name: string, label: string): DatasetColumn => ({ name, label, type: "number" });
const date = (name: string, label: string): DatasetColumn => ({ name, label, type: "date" });

const STATUS_COUNT_COLUMNS = [str("code", "Code"), str("name", "Status"), num("count", "Count")] as const;
const RANKING_COLUMNS = [str("name", "Name"), num("value", "Value")] as const;

export const DATASET_CATALOG = {
  sales_lines: {
    label: "Sales lines",
    description: "Branch sales with serial numbers and ATR/return status.",
    dashboardDateRange: true,
    columns: [
      date("date", "Date"),
      str("transactionNo", "Transaction No"),
      str("branch", "Branch"),
      str("stockSourceBranch", "Stock Source Branch"),
      str("serialNo", "Serial No"),
      str("skuCode", "SKU"),
      str("model", "Model"),
      str("packageType", "Package"),
      num("saleAmount", "Sale Amount"),
      str("atrStatus", "ATR Status"),
      str("returnStatus", "Return Status"),
      str("customer", "Customer"),
      str("siTrans", "SI/Trans"),
    ],
  },
  transfers: {
    label: "Transfers",
    description: "Branch-to-branch transfers with status.",
    dashboardDateRange: true,
    columns: [
      str("transferNo", "Transfer No"),
      str("fromBranch", "From Branch"),
      str("toBranch", "To Branch"),
      str("status", "Status"),
      date("date", "Date"),
      str("notes", "Notes"),
    ],
  },
  processed_orders: {
    label: "Processed orders",
    description: "Approved branch order lines with SPA approval details.",
    dashboardDateRange: true,
    columns: [
      date("dateProcessed", "Date Processed"),
      str("dealerName", "Dealer"),
      str("branch", "Branch"),
      str("brand", "Brand"),
      str("soNumber", "SO"),
      str("skuCode", "SKU"),
      num("orderedQty", "Ordered Qty"),
      num("approvedQty", "Approved Qty"),
      str("orderRemarks", "Order Remarks"),
      str("spaRemarks", "SPA Remarks"),
      str("lastUpdatedBy", "Last Updated By"),
      str("spaApprovedBy", "SPA Approved By"),
      str("spaApprovedAt", "SPA Approved At"),
      date("deliveryDueDate", "Delivery Due Date"),
      num("totalCbm", "Total CBM"),
      str("area", "Area"),
    ],
  },
  daily_stock: {
    label: "Daily stock",
    description: "Planogram shelf max vs on-hand and sold quantity for one day.",
    dashboardDateRange: false,
    columns: [
      date("date", "Date"),
      str("branch", "Branch"),
      str("skuCode", "SKU"),
      str("model", "Model"),
      num("shelfMax", "Shelf Max"),
      num("invQty", "Inventory"),
      num("soldQty", "Sold"),
    ],
  },
  inventory_detail: {
    label: "Inventory serials",
    description: "Branch inventory per serial with dealer classification, DR and aging.",
    dashboardDateRange: false,
    columns: [
      str("dealer", "Dealer"),
      str("branch", "Branch"),
      str("dealerType", "Dealer Type"),
      str("modeOfPayment", "Mode of Payment"),
      str("area", "Area"),
      str("dealerArea", "Dealer Area"),
      str("branchArea", "Branch Area"),
      str("serialNo", "Serial No"),
      str("skuCode", "SKU"),
      str("model", "Model"),
      str("status", "Status"),
      str("drNo", "DR No"),
      date("drDate", "DR Date"),
      num("agingDays", "Aging (days)"),
      str("countRemark", "Latest Count Remark"),
      // Derived on the server from agingDays (see AGING_BUCKETS).
      str("agingBucket", "Aging Bucket"),
    ],
  },
  inventory_summary: {
    label: "Inventory summary",
    description: "Inventory quantity per branch, SKU and status.",
    dashboardDateRange: false,
    columns: [str("branch", "Branch"), str("skuCode", "SKU"), str("status", "Status"), num("qty", "Qty")],
  },
  ops_kpis: {
    label: "Operations KPIs",
    description: "Single-row operations counters (same as the Operations dashboard).",
    dashboardDateRange: false,
    columns: [
      num("pendingOrderApprovals", "Pending Approvals"),
      num("deliveryInTransit", "Delivery In Transit"),
      num("stockCount", "Stock On Hand"),
      num("openAtr", "Open ATR"),
      num("belowPlanogramCapacity", "Below Planogram"),
      num("milBreaches", "MIL Breaches"),
      num("allocationGapCount", "Allocation Gaps"),
      num("draftSuggestedOrders", "Draft Suggested Orders"),
      num("ordersThisMonth", "Orders This Month"),
      num("salesThisMonth", "Sales This Month"),
    ],
  },
  inventory_by_status: {
    label: "Inventory by status",
    description: "Serial count per inventory status.",
    dashboardDateRange: false,
    columns: STATUS_COUNT_COLUMNS,
  },
  orders_by_status: {
    label: "Orders by status",
    description: "Branch order count per status.",
    dashboardDateRange: false,
    columns: STATUS_COUNT_COLUMNS,
  },
  sales_kpis: {
    label: "Sales KPIs",
    description: "Single-row sales counters for the current month.",
    dashboardDateRange: false,
    columns: [
      num("salesThisMonth", "Sales This Month"),
      num("saleAmountThisMonth", "Sale Amount This Month"),
      num("openAtr", "Open ATR"),
      num("returnsInProgress", "Returns In Progress"),
    ],
  },
  sale_status_mix: {
    label: "Sale status mix",
    description: "Serial count per sale status.",
    dashboardDateRange: false,
    columns: STATUS_COUNT_COLUMNS,
  },
  atr_return_pipeline: {
    label: "ATR and return pipeline",
    description: "ATR and return request count per stage.",
    dashboardDateRange: false,
    columns: STATUS_COUNT_COLUMNS,
  },
  top_branches: {
    label: "Top branches",
    description: "Branches ranked by sale amount this month.",
    dashboardDateRange: false,
    columns: RANKING_COLUMNS,
  },
  top_models: {
    label: "Top models",
    description: "Models ranked by units sold this month.",
    dashboardDateRange: false,
    columns: RANKING_COLUMNS,
  },
} as const satisfies Record<string, DatasetMeta>;

export type DatasetKey = keyof typeof DATASET_CATALOG;

export const DATASET_KEYS = Object.keys(DATASET_CATALOG) as DatasetKey[];

export function isDatasetKey(value: string): value is DatasetKey {
  return Object.hasOwn(DATASET_CATALOG, value);
}

export type DatasetRow = Record<string, string | number | null>;

/** Aging buckets for inventory_detail.agingBucket; labels sort in bucket order. */
export const AGING_BUCKETS = [
  { maxDays: 30, label: "0-30 days" },
  { maxDays: 60, label: "31-60 days" },
  { maxDays: 90, label: "61-90 days" },
  { maxDays: 180, label: "91-180 days" },
  { maxDays: Number.POSITIVE_INFINITY, label: "Over 180 days" },
] as const;

export function agingBucketLabel(days: number): string {
  return (AGING_BUCKETS.find((bucket) => days <= bucket.maxDays) ?? AGING_BUCKETS[AGING_BUCKETS.length - 1]).label;
}
