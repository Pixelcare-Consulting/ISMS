import ExcelJS from "exceljs";

import {
  INVENTORY_REPORT_DETAIL_HEADERS,
  INVENTORY_REPORT_SUMMARY_HEADERS,
} from "@/features/reports/utils/inventory-report-csv";

const SUMMARY_HEADER_FILL = "FF1F4E79";
const DETAIL_HEADER_FILL = "FF2E7D32";

const SUMMARY_COLUMN_WIDTHS = [24, 16, 14, 8];
const DETAIL_COLUMN_WIDTHS = [
  22, 22, 14, 14, 14, 14, 14, 18, 14, 18, 12, 12, 12, 12,
];

export type InventoryReportCell = string | number | null | undefined;

function styleHeaderRow(
  sheet: ExcelJS.Worksheet,
  fillArgb: string,
  columnCount: number,
) {
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 22;

  for (let col = 1; col <= columnCount; col += 1) {
    const cell = headerRow.getCell(col);
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: fillArgb },
    };
  }
}

function applyColumnWidths(sheet: ExcelJS.Worksheet, widths: number[]) {
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
}

/**
 * Build Inventory Report workbook with SUMMARY and DETAIL sheets
 * (colored frozen headers; no section marker rows).
 */
export async function buildInventoryReportWorkbook(
  summaryRows: InventoryReportCell[][],
  detailRows: InventoryReportCell[][],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ISMS";
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet("SUMMARY");
  summarySheet.addRow([...INVENTORY_REPORT_SUMMARY_HEADERS]);
  for (const row of summaryRows) {
    summarySheet.addRow(row.map((cell) => cell ?? ""));
  }
  styleHeaderRow(
    summarySheet,
    SUMMARY_HEADER_FILL,
    INVENTORY_REPORT_SUMMARY_HEADERS.length,
  );
  applyColumnWidths(summarySheet, SUMMARY_COLUMN_WIDTHS);
  summarySheet.views = [{ state: "frozen", ySplit: 1 }];

  const detailSheet = workbook.addWorksheet("DETAIL");
  detailSheet.addRow([...INVENTORY_REPORT_DETAIL_HEADERS]);
  for (const row of detailRows) {
    detailSheet.addRow(row.map((cell) => cell ?? ""));
  }
  styleHeaderRow(
    detailSheet,
    DETAIL_HEADER_FILL,
    INVENTORY_REPORT_DETAIL_HEADERS.length,
  );
  applyColumnWidths(detailSheet, DETAIL_COLUMN_WIDTHS);
  detailSheet.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
