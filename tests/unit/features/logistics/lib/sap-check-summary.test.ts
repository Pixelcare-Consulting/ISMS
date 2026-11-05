import { summarizeSapCheck, type SapCheckResult } from "@/features/logistics/lib/sap-check-summary";

const NOTHING: SapCheckResult = {
  applied: 0,
  failed: 0,
  flagged: 0,
  importedOrders: 0,
  soImportOff: false,
  skippedOrders: 0,
  skippedOrderReasons: [],
  soImportError: null,
};

describe("summarizeSapCheck", () => {
  it("says so when nothing is new", () => {
    expect(summarizeSapCheck(NOTHING)).toEqual({ tone: "info", title: "No new SAP documents" });
  });

  it("warns that Sales Orders are not imported while no start date is set", () => {
    expect(summarizeSapCheck({ ...NOTHING, soImportOff: true })).toEqual({
      tone: "warning",
      title: "No new SAP documents",
      description:
        "Sales Orders made in SAP are not imported until a start date is set in Settings → Ordering.",
    });
  });

  it("names an imported Sales Order and where to find it", () => {
    expect(summarizeSapCheck({ ...NOTHING, importedOrders: 1 })).toEqual({
      tone: "success",
      title: "Imported 1 Sales Order made in SAP. See Order History.",
      description: undefined,
    });
  });

  it("gives the reason a Sales Order was not imported", () => {
    const summary = summarizeSapCheck({
      ...NOTHING,
      skippedOrders: 1,
      skippedOrderReasons: ["SO 97568 ships from ELG011, not an ISMS warehouse"],
    });
    expect(summary.tone).toBe("warning");
    expect(summary.description).toBe(
      "1 Sales Order not imported: SO 97568 ships from ELG011, not an ISMS warehouse.",
    );
  });

  it("reports a failed Sales Order read instead of saying nothing is new", () => {
    expect(summarizeSapCheck({ ...NOTHING, soImportError: "SAP is down" }).description).toBe(
      "Could not read Sales Orders from SAP: SAP is down",
    );
  });

  it("keeps the Sales Order result beside delivery documents", () => {
    expect(summarizeSapCheck({ ...NOTHING, applied: 2, importedOrders: 1 })).toEqual({
      tone: "success",
      title: "Added 2 SAP documents to deliveries",
      description: "Imported 1 Sales Order made in SAP. See Order History.",
    });
    expect(summarizeSapCheck({ ...NOTHING, applied: 1, flagged: 2, soImportOff: true })).toMatchObject({
      tone: "warning",
      title: "2 SAP documents could not be added",
      description: expect.stringContaining("1 other was added. Open the delivery to see why."),
    });
  });
});
