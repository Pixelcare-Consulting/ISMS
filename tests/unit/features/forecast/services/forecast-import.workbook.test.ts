import ExcelJS from "exceljs";

import {
  buildForecastTemplateWorkbook,
  readForecastImportWorkbook,
} from "@/features/forecast/services/forecast-import.workbook";

describe("forecast import workbook", () => {
  it("fills the SFE template with the branch name", async () => {
    const buffer = await buildForecastTemplateWorkbook([
      { period: "Dec-25", branchName: "Western Makati", sku: "32STW101", forecastQty: 20 },
    ]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet("SFE");
    expect(sheet?.getRow(1).values).toEqual([
      undefined,
      "period",
      "branch_name",
      "sku",
      "forecast_qty",
    ]);
    expect(sheet?.getRow(2).getCell(2).value).toBe("Western Makati");
  });

  it("reads an SFE file that uses the branch name", async () => {
    const sheets = await readForecastImportWorkbook(
      Buffer.from("period,branch_name,sku,forecast_qty\nDec-25,Western Makati,32STW101,20\n"),
    );
    expect(sheets.sfe.rows[0]?.values).toMatchObject({
      period: "Dec-25",
      branch_name: "Western Makati",
      sku: "32STW101",
      forecast_qty: "20",
    });
  });

  it("rejects a file that still uses the branch SAP code", async () => {
    await expect(
      readForecastImportWorkbook(
        Buffer.from("period,branch_sap_code,sku,forecast_qty\nDec-25,WMK-001,32STW101,20\n"),
      ),
    ).rejects.toThrow(/branch_name/);
  });

  it("rejects a planogram file, including one that re-adds a max column", async () => {
    await expect(
      readForecastImportWorkbook(
        Buffer.from("branch_name,sku,shelf_max\nWestern Makati,100L10E,2\n"),
      ),
    ).rejects.toThrow(/Planogram/);

    await expect(
      readForecastImportWorkbook(
        Buffer.from("branch_sap_code,sku,max_qty\nWMK-001,100L10E,2\n"),
      ),
    ).rejects.toThrow(/Planogram/);

    await expect(
      readForecastImportWorkbook(
        Buffer.from(
          "period,branch_name,sku,forecast_qty,shelf_max\nDec-25,Western Makati,32STW101,20,2\n",
        ),
      ),
    ).rejects.toThrow(/Planogram/);
  });
});
