import {
  DAILY_STOCK_REPORT_HEADERS,
  PROCESSED_ORDERS_REPORT_HEADERS,
  SALES_REPORT_HEADERS,
  TRANSFER_REPORT_HEADERS,
} from "@/features/reports/constants/report-headers";
import {
  INVENTORY_REPORT_DETAIL_HEADERS,
  INVENTORY_REPORT_SUMMARY_HEADERS,
} from "@/features/reports/utils/inventory-report-csv";
import type { DatasetKey } from "@/features/reporting/datasets/dataset-catalog";

/**
 * Stimulsoft report layouts. Pure metadata shared by the template build
 * script (which turns each entry into an .mrt) and the report pages (title,
 * datasets to fetch, which filters to show).
 *
 * Reports the client already approved as CSV/Excel mirror those exports
 * exactly: same columns, order, header text and values (headers come from
 * the same constants the exports use). No grouping or totals are added.
 */

export interface ReportColumnSpec {
  /** Header text printed on the report. */
  header: string;
  /** Column name from DATASET_CATALOG[datasetKey]; omit for a column the export always leaves blank. */
  name?: string;
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
  /** Body font size in points (default 8); wide reports go smaller so every column fits. */
  fontSize?: number;
  sections: readonly ReportSectionSpec[];
  filters: readonly ReportFilterField[];
}

/** Pairs each approved export header with its dataset column and print width. */
function columns(
  headers: readonly string[],
  specs: readonly Omit<ReportColumnSpec, "header">[],
): ReportColumnSpec[] {
  if (headers.length !== specs.length) {
    throw new Error(`Report columns (${specs.length}) don't match export headers (${headers.length})`);
  }
  return specs.map((spec, i) => ({ header: headers[i], ...spec }));
}

export const REPORT_DEFINITIONS = {
  "processed-orders": {
    title: "Processed Orders",
    orientation: "LANDSCAPE",
    fontSize: 6,
    filters: ["dateRange"],
    sections: [
      {
        datasetKey: "processed_orders",
        columns: columns(PROCESSED_ORDERS_REPORT_HEADERS, [
          { name: "dateProcessed", weight: 6 },
          { name: "dealerName", weight: 8 },
          { name: "branch", weight: 9 },
          { name: "brand", weight: 6 },
          { name: "soNumber", weight: 7 },
          { name: "skuCode", weight: 7 },
          { name: "orderedQty", weight: 4 },
          { name: "approvedQty", weight: 4 },
          { name: "orderRemarks", weight: 8 },
          { name: "spaRemarks", weight: 8 },
          { name: "lastUpdatedBy", weight: 7 },
          { name: "spaApprovedBy", weight: 7 },
          { name: "spaApprovedAt", weight: 8 },
          { name: "deliveryDueDate", weight: 6 },
          { name: "totalCbmText", weight: 5 },
          { name: "area", weight: 6 },
          { weight: 5 }, // REGION: blank in the export
          { weight: 5 }, // PROVINCE: blank in the export
        ]),
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
        columns: columns(DAILY_STOCK_REPORT_HEADERS, [
          { name: "date", weight: 9 },
          { name: "branch", weight: 18 },
          { name: "skuCode", weight: 12 },
          { name: "model", weight: 22 },
          { name: "shelfMax", weight: 7 },
          { name: "invQty", weight: 6 },
          { name: "soldQty", weight: 6 },
        ]),
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
        columns: columns(TRANSFER_REPORT_HEADERS, [
          { name: "transferNo", weight: 14 },
          { name: "fromBranch", weight: 18 },
          { name: "toBranch", weight: 18 },
          { name: "status", weight: 12 },
          { name: "date", weight: 10 },
          { name: "notes", weight: 20 },
        ]),
      },
    ],
  },
  sales: {
    title: "Sales & Returns",
    orientation: "LANDSCAPE",
    fontSize: 7,
    filters: ["dateRange"],
    sections: [
      {
        datasetKey: "sales_lines",
        columns: columns(SALES_REPORT_HEADERS, [
          { name: "date", weight: 7 },
          { name: "transactionNo", weight: 9 },
          { name: "branch", weight: 11 },
          { name: "stockSourceBranch", weight: 11 },
          { name: "serialNo", weight: 10 },
          { name: "modelLabel", weight: 16 },
          { name: "packageType", weight: 7 },
          { name: "saleAmount", weight: 7 },
          { name: "atrStatus", weight: 6 },
          { name: "returnStatus", weight: 7 },
          { name: "customer", weight: 10 },
          { name: "siTrans", weight: 7 },
        ]),
      },
    ],
  },
  inventory: {
    title: "Inventory",
    orientation: "LANDSCAPE",
    fontSize: 6,
    filters: ["dateRange", "branch", "sku", "inventoryStatus"],
    sections: [
      {
        datasetKey: "inventory_summary",
        heading: "SUMMARY",
        columns: columns(INVENTORY_REPORT_SUMMARY_HEADERS, [
          { name: "branch", weight: 24 },
          { name: "skuCode", weight: 16 },
          { name: "status", weight: 14 },
          { name: "qty", weight: 8 },
        ]),
      },
      {
        datasetKey: "inventory_detail",
        heading: "DETAIL",
        newPage: true,
        columns: columns(INVENTORY_REPORT_DETAIL_HEADERS, [
          { name: "dealer", weight: 9 },
          { name: "branch", weight: 9 },
          { name: "dealerType", weight: 6 },
          { name: "modeOfPayment", weight: 6 },
          { name: "area", weight: 6 },
          { name: "dealerArea", weight: 6 },
          { name: "branchArea", weight: 6 },
          { name: "serialNo", weight: 9 },
          { name: "skuCode", weight: 6 },
          { name: "model", weight: 10 },
          { name: "status", weight: 5 },
          { name: "drNo", weight: 6 },
          { name: "drDate", weight: 6 },
          { name: "agingDays", weight: 4 },
          { name: "countRemark", weight: 8 },
        ]),
      },
    ],
  },
  pcount: {
    title: "P-Count Sessions",
    orientation: "PORTRAIT",
    filters: ["dateRange", "branch"],
    sections: [
      {
        datasetKey: "pcount_sessions",
        groupBy: "branch",
        columns: [
          { header: "Closed", name: "closedAt", weight: 10 },
          { header: "Session", name: "sessionNo", weight: 14 },
          { header: "Created By", name: "createdBy", weight: 18 },
          { header: "Lines", name: "lineCount", weight: 8, total: true },
          { header: "Counted", name: "countedCount", weight: 8, total: true },
          { header: "Variances", name: "varianceCount", weight: 8, total: true },
        ],
      },
    ],
  },
} as const satisfies Record<string, ReportDefinition>;

export type ReportKey = keyof typeof REPORT_DEFINITIONS;

export function reportDatasetKeys(key: ReportKey): DatasetKey[] {
  return REPORT_DEFINITIONS[key].sections.map((s) => s.datasetKey);
}
