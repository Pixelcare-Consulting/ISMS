import ExcelJS from "exceljs";

import {
  buildPlanogramTemplateWorkbook,
  readPlanogramImportWorkbook,
} from "@/features/planogram/services/planogram-import.workbook";

describe("planogram import workbook", () => {
  it("fills the template with branch name and SKU only", async () => {
    const buffer = await buildPlanogramTemplateWorkbook([
      { branchName: "Western Makati", sku: "100L10E" },
    ]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    expect(sheet?.getRow(1).values).toEqual([undefined, "branch_name", "sku"]);
    expect(sheet?.getRow(2).values).toEqual([undefined, "Western Makati", "100L10E"]);
  });

  it("reads branch name and SKU", async () => {
    const sheet = await readPlanogramImportWorkbook(
      Buffer.from("Branch Name,SKU\nWestern Makati,100L10E\n"),
    );
    expect(sheet.rows).toEqual([
      { rowNumber: 2, values: { branch_name: "Western Makati", sku: "100L10E" } },
    ]);
  });

  it("ignores a shelf max column left in an older file", async () => {
    const sheet = await readPlanogramImportWorkbook(
      Buffer.from("branch_name,sku,shelf_max\nWestern Makati,100L10E,4\n"),
    );
    expect(sheet.rows).toEqual([
      { rowNumber: 2, values: { branch_name: "Western Makati", sku: "100L10E" } },
    ]);
  });

  it("rejects a Forecast file, which also has branch name and SKU", async () => {
    await expect(
      readPlanogramImportWorkbook(
        Buffer.from("period,branch_name,sku,forecast_qty\nDec-25,Western Makati,100L10E,20\n"),
      ),
    ).rejects.toThrow(/Forecast template/);
  });

  it("rejects a Forecast workbook with no Planogram sheet", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("SFE");
    sheet.addRow(["period", "branch_name", "sku", "forecast_qty"]);
    sheet.addRow(["Dec-25", "Western Makati", "100L10E", 20]);
    const file = Buffer.from(await workbook.xlsx.writeBuffer());

    await expect(readPlanogramImportWorkbook(file)).rejects.toThrow(/Forecast template/);
  });

  it("rejects a file that still uses the branch SAP code", async () => {
    await expect(
      readPlanogramImportWorkbook(Buffer.from("branch_sap_code,sku\nWMK-001,100L10E\n")),
    ).rejects.toThrow(/branch_name/);
  });
});
