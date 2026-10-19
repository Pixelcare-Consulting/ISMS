import ExcelJS from "exceljs";

import {
  buildPlanogramTemplateWorkbook,
  readPlanogramImportWorkbook,
} from "@/features/planogram/services/planogram-import.workbook";

describe("planogram import workbook", () => {
  it("fills the template with branch name, SKU, and shelf max", async () => {
    const buffer = await buildPlanogramTemplateWorkbook([
      { branchName: "Western Makati", sku: "100L10E", maxQty: 3 },
    ]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    expect(sheet?.getRow(1).values).toEqual([undefined, "branch_name", "sku", "shelf_max"]);
    expect(sheet?.getRow(2).values).toEqual([undefined, "Western Makati", "100L10E", 3]);
  });

  it("reads branch name, SKU, and shelf max", async () => {
    const sheet = await readPlanogramImportWorkbook(
      Buffer.from("Branch Name,SKU,Shelf max\nWestern Makati,100L10E,4\n"),
    );
    expect(sheet.rows).toEqual([
      {
        rowNumber: 2,
        values: { branch_name: "Western Makati", sku: "100L10E", shelf_max: "4" },
      },
    ]);
  });

  it("rejects a file that still uses the branch SAP code", async () => {
    await expect(
      readPlanogramImportWorkbook(Buffer.from("branch_sap_code,sku\nWMK-001,100L10E\n")),
    ).rejects.toThrow(/branch_name/);
  });
});
