import ExcelJS from "exceljs";

import {
  INVENTORY_REPORT_DETAIL_HEADERS,
  INVENTORY_REPORT_SUMMARY_HEADERS,
} from "@/features/reports/utils/inventory-report-csv";
import { buildInventoryReportWorkbook } from "@/features/reports/utils/inventory-report.workbook";

describe("buildInventoryReportWorkbook", () => {
  it("creates SUMMARY and DETAIL sheets with headers and sample rows", async () => {
    const buffer = await buildInventoryReportWorkbook(
      [["Branch A", "SKU-1", "Stock", 2]],
      [
        [
          "Dealer",
          "Branch A",
          "Type",
          "Cash",
          "Area",
          "DArea",
          "BArea",
          "SN-1",
          "SKU-1",
          "Model",
          "Stock",
          "DR-1",
          "2026-10-01",
          14,
        ],
      ],
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

    expect(workbook.worksheets.map((s) => s.name)).toEqual([
      "SUMMARY",
      "DETAIL",
    ]);

    const summary = workbook.getWorksheet("SUMMARY");
    expect(summary).toBeDefined();
    expect(
      INVENTORY_REPORT_SUMMARY_HEADERS.map((_, i) =>
        String(summary!.getRow(1).getCell(i + 1).value ?? ""),
      ),
    ).toEqual([...INVENTORY_REPORT_SUMMARY_HEADERS]);
    expect(summary!.getRow(2).getCell(1).value).toBe("Branch A");
    expect(summary!.getRow(2).getCell(4).value).toBe(2);

    const detail = workbook.getWorksheet("DETAIL");
    expect(detail).toBeDefined();
    expect(
      INVENTORY_REPORT_DETAIL_HEADERS.map((_, i) =>
        String(detail!.getRow(1).getCell(i + 1).value ?? ""),
      ),
    ).toEqual([...INVENTORY_REPORT_DETAIL_HEADERS]);
    expect(detail!.getRow(2).getCell(8).value).toBe("SN-1");
  });
});
