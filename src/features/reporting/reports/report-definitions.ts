import type { DatasetKey } from "@/features/reporting/datasets/dataset-catalog";

/**
 * Stimulsoft report layouts. Pure metadata shared by the template build
 * script (which turns each entry into an .mrt) and the report pages (title,
 * datasets to fetch, which filters to show).
 */

export interface ReportColumnSpec {
  /** Column name from DATASET_CATALOG[datasetKey]. */
  name: string;
  /** Relative width; scaled to the printable page width. */
  weight: number;
  /** Adds a Sum() total in the section footer (number columns only). */
  total?: boolean;
}

export interface ReportSectionSpec {
  datasetKey: DatasetKey;
  heading?: string;
  columns: readonly ReportColumnSpec[];
  /** Groups rows under a header per distinct value of this column. */
  groupBy?: string;
  /** Starts the section on a new page (multi-section reports). */
  newPage?: boolean;
}

export type ReportFilterField = "dateRange" | "date" | "branch" | "sku" | "inventoryStatus";

export interface ReportDefinition {
  title: string;
  orientation: "PORTRAIT" | "LANDSCAPE";
  sections: readonly ReportSectionSpec[];
  filters: readonly ReportFilterField[];
}

export const REPORT_DEFINITIONS = {
  "processed-orders": {
    title: "Processed Orders",
    orientation: "LANDSCAPE",
    filters: ["dateRange"],
    sections: [
      {
        datasetKey: "processed_orders",
        groupBy: "branch",
        columns: [
          { name: "dateProcessed", weight: 9 },
          { name: "soNumber", weight: 10 },
          { name: "brand", weight: 8 },
          { name: "skuCode", weight: 12 },
          { name: "orderedQty", weight: 6, total: true },
          { name: "approvedQty", weight: 6, total: true },
          { name: "spaApprovedBy", weight: 11 },
          { name: "spaApprovedAt", weight: 12 },
          { name: "deliveryDueDate", weight: 9 },
          { name: "totalCbm", weight: 7, total: true },
          { name: "spaRemarks", weight: 14 },
        ],
      },
    ],
  },
  "daily-stock": {
    title: "Daily Stock",
    orientation: "PORTRAIT",
    filters: ["date"],
    sections: [
      {
        datasetKey: "daily_stock",
        groupBy: "branch",
        columns: [
          { name: "skuCode", weight: 16 },
          { name: "model", weight: 30 },
          { name: "shelfMax", weight: 8, total: true },
          { name: "invQty", weight: 8, total: true },
          { name: "soldQty", weight: 8, total: true },
        ],
      },
    ],
  },
  transfers: {
    title: "Transfers",
    orientation: "PORTRAIT",
    filters: ["dateRange"],
    sections: [
      {
        datasetKey: "transfers",
        columns: [
          { name: "date", weight: 10 },
          { name: "transferNo", weight: 14 },
          { name: "fromBranch", weight: 18 },
          { name: "toBranch", weight: 18 },
          { name: "status", weight: 12 },
          { name: "notes", weight: 20 },
        ],
      },
    ],
  },
  sales: {
    title: "Sales & Returns",
    orientation: "LANDSCAPE",
    filters: ["dateRange"],
    sections: [
      {
        datasetKey: "sales_lines",
        groupBy: "branch",
        columns: [
          { name: "date", weight: 8 },
          { name: "transactionNo", weight: 11 },
          { name: "serialNo", weight: 12 },
          { name: "skuCode", weight: 10 },
          { name: "model", weight: 16 },
          { name: "packageType", weight: 9 },
          { name: "saleAmount", weight: 9, total: true },
          { name: "atrStatus", weight: 7 },
          { name: "returnStatus", weight: 8 },
          { name: "customer", weight: 12 },
        ],
      },
    ],
  },
  inventory: {
    title: "Inventory",
    orientation: "LANDSCAPE",
    filters: ["dateRange", "branch", "sku", "inventoryStatus"],
    sections: [
      {
        datasetKey: "inventory_summary",
        heading: "Summary",
        groupBy: "branch",
        columns: [
          { name: "skuCode", weight: 20 },
          { name: "status", weight: 20 },
          { name: "qty", weight: 8, total: true },
        ],
      },
      {
        datasetKey: "inventory_detail",
        heading: "Serial detail",
        groupBy: "branch",
        newPage: true,
        columns: [
          { name: "serialNo", weight: 13 },
          { name: "skuCode", weight: 10 },
          { name: "model", weight: 16 },
          { name: "status", weight: 8 },
          { name: "dealerType", weight: 9 },
          { name: "area", weight: 9 },
          { name: "drNo", weight: 9 },
          { name: "drDate", weight: 8 },
          { name: "agingDays", weight: 6 },
          { name: "countRemark", weight: 12 },
        ],
      },
    ],
  },
} as const satisfies Record<string, ReportDefinition>;

export type ReportKey = keyof typeof REPORT_DEFINITIONS;

export function reportDatasetKeys(key: ReportKey): DatasetKey[] {
  return REPORT_DEFINITIONS[key].sections.map((s) => s.datasetKey);
}
