import ExcelJS from "exceljs";

import {
  buildBranchQuotaTemplateWorkbook,
  readBranchQuotaImportWorkbook,
} from "@/features/branch-quotas/services/branch-quota-import.workbook";

describe("branch quota import workbook", () => {
  it("fills the template with the branch name", async () => {
    const buffer = await buildBranchQuotaTemplateWorkbook([
      {
        branchName: "Western Makati",
        brandName: "Devant",
        month: "2026-10",
        quotaAmount: "100",
      },
    ]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    expect(sheet?.getRow(1).values).toEqual([
      undefined,
      "branch_name",
      "brand_name",
      "month",
      "quota_amount",
    ]);
    expect(sheet?.getRow(2).getCell(1).value).toBe("Western Makati");
  });

  it("reads the branch name column", async () => {
    const sheet = await readBranchQuotaImportWorkbook(
      Buffer.from("branch_name,brand_name,month,quota_amount\nWestern Makati,Devant,2026-10,100\n"),
    );
    expect(sheet.rows[0]?.values.branchname).toBe("Western Makati");
  });

  it("rejects a file that still uses the branch SAP code", async () => {
    await expect(
      readBranchQuotaImportWorkbook(
        Buffer.from("branch_sap_code,brand_name,month,quota_amount\nWMK-001,Devant,2026-10,100\n"),
      ),
    ).rejects.toThrow(/branch_name/);
  });
});
