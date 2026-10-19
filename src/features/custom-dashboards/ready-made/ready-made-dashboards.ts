import type { DashboardElementSpec, DashboardSpec } from "@/features/reporting/dashboards/dashboard-layout";
import type { DatasetKey } from "@/features/reporting/datasets/dataset-catalog";

/**
 * Ready-made dashboards shipped with the app. Each spec is generated into
 * templates/dashboards/ready-made/<key>.mrt.json by `pnpm reporting:templates`.
 * They are read-only for everyone with Custom Dashboards access; users with
 * manage access can copy one into their own editable dashboard.
 */

export interface ReadyMadeDashboard {
  name: string;
  description: string;
  spec: DashboardSpec;
}

const tile = (
  name: string,
  title: string,
  datasetKey: DatasetKey,
  value: DashboardElementSpec["value"],
  decimals: 0 | 2 = 0,
): DashboardElementSpec => ({ name, kind: "INDICATOR", title, datasetKey, value, decimals });

const branchFilter = (name: string, datasetKey: DatasetKey): DashboardElementSpec => ({
  name,
  kind: "FILTER",
  title: "Branch",
  datasetKey,
  argument: "branch",
});

/** Keeps the literal keys but widens each entry to the spec types. */
function defineReadyMade<K extends string>(dashboards: Record<K, ReadyMadeDashboard>): Record<K, ReadyMadeDashboard> {
  return dashboards;
}

export const READY_MADE_DASHBOARDS = defineReadyMade({
  "sales-trends": {
    name: "Sales Trends",
    description: "Daily sales, top branches and models, ATR status and package mix for the dates you pick.",
    spec: {
      title: "Sales Trends",
      sections: [
        { id: "filters", layout: "FILTERS", elements: [branchFilter("SalesBranchFilter", "sales_lines")] },
        {
          id: "kpis",
          layout: "TILES",
          elements: [
            tile("SalesUnits", "Units sold", "sales_lines", { column: "serialNo", aggregate: "COUNT" }),
            tile("SalesAmount", "Sale amount", "sales_lines", { column: "saleAmount", aggregate: "SUM" }, 2),
            tile("SalesTransactions", "Transactions", "sales_lines", { column: "transactionNo", aggregate: "DISTINCT_COUNT" }),
            tile("SalesBranches", "Branches selling", "sales_lines", { column: "branch", aggregate: "DISTINCT_COUNT" }),
          ],
        },
        {
          id: "trend",
          layout: "FULL",
          elements: [
            {
              name: "SalesDaily",
              kind: "COLUMN",
              title: "Daily sale amount",
              datasetKey: "sales_lines",
              argument: "date",
              value: { column: "saleAmount", aggregate: "SUM" },
              decimals: 2,
            },
          ],
        },
        {
          id: "rankings",
          layout: "PANELS",
          elements: [
            {
              name: "SalesTopBranches",
              kind: "BAR",
              title: "Top 10 branches by sale amount",
              datasetKey: "sales_lines",
              argument: "branch",
              value: { column: "saleAmount", aggregate: "SUM" },
              decimals: 2,
              topN: 10,
            },
            {
              name: "SalesTopModels",
              kind: "BAR",
              title: "Top 10 models by units sold",
              datasetKey: "sales_lines",
              argument: "model",
              value: { column: "serialNo", aggregate: "COUNT" },
              topN: 10,
            },
          ],
        },
        {
          id: "mix",
          layout: "PANELS",
          elements: [
            {
              name: "SalesAtrMix",
              kind: "DOUGHNUT",
              title: "Units by ATR status",
              datasetKey: "sales_lines",
              argument: "atrStatus",
              value: { column: "serialNo", aggregate: "COUNT" },
            },
            {
              name: "SalesPackageMix",
              kind: "DOUGHNUT",
              title: "Units by package",
              datasetKey: "sales_lines",
              argument: "packageType",
              value: { column: "serialNo", aggregate: "COUNT" },
            },
          ],
        },
      ],
    },
  },
  "inventory-health": {
    name: "Inventory Health",
    description: "In-stock units by aging bucket, branch, model and dealer type, with average aging.",
    spec: {
      title: "Inventory Health",
      sections: [
        {
          id: "filters",
          layout: "FILTERS",
          elements: [
            branchFilter("InventoryBranchFilter", "inventory_detail"),
            { name: "InventoryAreaFilter", kind: "FILTER", title: "Area", datasetKey: "inventory_detail", argument: "area" },
          ],
        },
        {
          id: "kpis",
          layout: "TILES",
          elements: [
            tile("InventoryUnits", "Units in stock", "inventory_detail", { column: "serialNo", aggregate: "COUNT" }),
            tile("InventoryAvgAging", "Average aging (days)", "inventory_detail", { column: "agingDays", aggregate: "AVG" }),
            tile("InventoryBranches", "Branches with stock", "inventory_detail", { column: "branch", aggregate: "DISTINCT_COUNT" }),
            tile("InventoryModels", "Models in stock", "inventory_detail", { column: "skuCode", aggregate: "DISTINCT_COUNT" }),
          ],
        },
        {
          id: "aging",
          layout: "PANELS",
          elements: [
            {
              name: "InventoryAgingBuckets",
              kind: "COLUMN",
              title: "Units by aging",
              datasetKey: "inventory_detail",
              argument: "agingBucket",
              value: { column: "serialNo", aggregate: "COUNT" },
            },
            {
              name: "InventoryDealerType",
              kind: "DOUGHNUT",
              title: "Units by dealer type",
              datasetKey: "inventory_detail",
              argument: "dealerType",
              value: { column: "serialNo", aggregate: "COUNT" },
            },
          ],
        },
        {
          id: "rankings",
          layout: "PANELS",
          elements: [
            {
              name: "InventoryTopBranches",
              kind: "BAR",
              title: "Top 10 branches by units",
              datasetKey: "inventory_detail",
              argument: "branch",
              value: { column: "serialNo", aggregate: "COUNT" },
              topN: 10,
            },
            {
              name: "InventoryTopModels",
              kind: "BAR",
              title: "Top 10 models by units",
              datasetKey: "inventory_detail",
              argument: "model",
              value: { column: "serialNo", aggregate: "COUNT" },
              topN: 10,
            },
          ],
        },
        {
          id: "table",
          layout: "FULL",
          elements: [
            {
              name: "InventoryBranchTable",
              kind: "TABLE",
              title: "Stock and aging by branch",
              datasetKey: "inventory_detail",
              columns: [
                { column: "branch" },
                { column: "area" },
                { column: "serialNo", aggregate: "COUNT", label: "Units" },
                { column: "agingDays", aggregate: "AVG", label: "Avg aging (days)" },
              ],
            },
          ],
        },
      ],
    },
  },
  "orders-logistics": {
    name: "Orders & Logistics",
    description: "Order pipeline, approved quantities over time, and transfer status for the dates you pick.",
    spec: {
      title: "Orders & Logistics",
      sections: [
        {
          id: "kpis",
          layout: "TILES",
          elements: [
            tile("OpsPending", "Pending approvals", "ops_kpis", { column: "pendingOrderApprovals", aggregate: "SUM" }),
            tile("OpsInTransit", "Delivery in transit", "ops_kpis", { column: "deliveryInTransit", aggregate: "SUM" }),
            tile("OpsApprovedQty", "Approved qty", "processed_orders", { column: "approvedQty", aggregate: "SUM" }),
            tile("OpsTransfers", "Transfers", "transfers", { column: "transferNo", aggregate: "DISTINCT_COUNT" }),
          ],
        },
        {
          id: "trend",
          layout: "FULL",
          elements: [
            {
              name: "OpsApprovedDaily",
              kind: "COLUMN",
              title: "Approved quantity by day",
              datasetKey: "processed_orders",
              argument: "dateProcessed",
              value: { column: "approvedQty", aggregate: "SUM" },
            },
          ],
        },
        {
          id: "pipeline",
          layout: "PANELS",
          elements: [
            {
              name: "OpsOrdersByStatus",
              kind: "BAR",
              title: "Orders by status (current)",
              datasetKey: "orders_by_status",
              argument: "name",
              value: { column: "count", aggregate: "SUM" },
            },
            {
              name: "OpsTransfersByStatus",
              kind: "DOUGHNUT",
              title: "Transfers by status",
              datasetKey: "transfers",
              argument: "status",
              value: { column: "transferNo", aggregate: "DISTINCT_COUNT" },
            },
          ],
        },
        {
          id: "rankings",
          layout: "PANELS",
          elements: [
            {
              name: "OpsTopBranches",
              kind: "BAR",
              title: "Top 10 branches by approved qty",
              datasetKey: "processed_orders",
              argument: "branch",
              value: { column: "approvedQty", aggregate: "SUM" },
              topN: 10,
            },
            {
              name: "OpsApprovedByBrand",
              kind: "DOUGHNUT",
              title: "Approved qty by brand",
              datasetKey: "processed_orders",
              argument: "brand",
              value: { column: "approvedQty", aggregate: "SUM" },
            },
          ],
        },
      ],
    },
  },
});

export type ReadyMadeDashboardKey = keyof typeof READY_MADE_DASHBOARDS;

export const READY_MADE_KEYS = Object.keys(READY_MADE_DASHBOARDS) as ReadyMadeDashboardKey[];

export function isReadyMadeKey(value: string): value is ReadyMadeDashboardKey {
  return Object.hasOwn(READY_MADE_DASHBOARDS, value);
}
