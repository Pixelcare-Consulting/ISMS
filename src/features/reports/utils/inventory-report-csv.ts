import { buildCsvContent, buildCsvRow } from "@/lib/shared/csv";

export const INVENTORY_REPORT_DETAIL_HEADERS = [
  "DEALER NAME",
  "BRANCH NAME",
  "DEALER TYPE",
  "MODE OF PAYMENT",
  "AREA",
  "DEALER AREA",
  "BRANCH AREA",
  "SERIAL NO",
  "SKU",
  "MODEL",
  "STATUS",
  "SAP DOC#",
  "SAP DOC DATE",
  "AGING DAYS",
  "REMARKS",
] as const;

export const INVENTORY_REPORT_SUMMARY_HEADERS = [
  "BRANCH",
  "SKU",
  "STATUS",
  "QTY",
] as const;

/** SUMMARY block then DETAIL serial rows (no DB). */
export function buildInventoryReportSectionedCsv(
  summaryRows: (string | number | null | undefined)[][],
  detailRows: (string | number | null | undefined)[][],
): string {
  const lines = [
    "# SUMMARY",
    buildCsvRow([...INVENTORY_REPORT_SUMMARY_HEADERS]),
    ...summaryRows.map((row) => buildCsvRow(row)),
    "# DETAIL",
    buildCsvContent([...INVENTORY_REPORT_DETAIL_HEADERS], detailRows),
  ];
  return lines.join("\r\n");
}
