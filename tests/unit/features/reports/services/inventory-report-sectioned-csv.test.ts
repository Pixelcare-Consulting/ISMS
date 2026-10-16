import { buildInventoryReportSectionedCsv } from "@/features/reports/utils/inventory-report-csv";

describe("buildInventoryReportSectionedCsv", () => {
  it("emits SUMMARY then DETAIL sections with qty counts", () => {
    const csv = buildInventoryReportSectionedCsv(
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

    expect(csv.startsWith("# SUMMARY\r\n")).toBe(true);
    expect(csv).toContain("BRANCH,SKU,STATUS,QTY");
    expect(csv).toContain("Branch A,SKU-1,Stock,2");
    expect(csv).toContain("# DETAIL\r\n");
    expect(csv).toContain("SERIAL NO");
    expect(csv).toContain("SN-1");
  });
});
