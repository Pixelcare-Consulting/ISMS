import { exportInventoryReportSchema } from "@/features/reports/schemas/inventory-report.schema";

describe("exportInventoryReportSchema", () => {
  it("accepts optional sku, statusCodes, and branchId", () => {
    const parsed = exportInventoryReportSchema.parse({
      from: "2026-10-01",
      to: "2026-10-15",
      sku: "SWS-01",
      statusCodes: ["STK", "DIT"],
      branchId: "branch-1",
    });
    expect(parsed.sku).toBe("SWS-01");
    expect(parsed.statusCodes).toEqual(["STK", "DIT"]);
    expect(parsed.branchId).toBe("branch-1");
  });

  it("allows empty statusCodes (all statuses) and omits filters", () => {
    expect(exportInventoryReportSchema.parse({ statusCodes: [] })).toEqual({
      statusCodes: [],
    });
    expect(exportInventoryReportSchema.parse({})).toEqual({});
  });

  it("rejects oversized sku", () => {
    expect(() =>
      exportInventoryReportSchema.parse({ sku: "x".repeat(121) }),
    ).toThrow();
  });
});
