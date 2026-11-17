import { pulloutPrintDocument } from "@/app/(app)/logistics/_components/pullout-print";
import { slipsHtml } from "@/app/(app)/logistics/_components/slip-print";
import { shipmentPrintDocument, shipmentPrintHtml } from "@/app/(app)/logistics/_components/shipment-print";
import type { PulloutDetail } from "@/features/logistics/services/pullout-posting.service";

const line = (overrides: Partial<PulloutDetail["lines"][number]> = {}) =>
  ({
    serialNumberId: "s1",
    serialNo: "SN1",
    skuCode: "SKU1",
    modelName: "Model One",
    priorCode: "STK",
    reasonName: "Overstock",
    problemDescriptionNames: [],
    classificationNames: [],
    unitPackingConditionNames: [],
    accessoryCompletenessNames: [],
    remarks: "Box dented",
    rejectedAt: null,
    ...overrides,
  }) as PulloutDetail["lines"][number];

const detail = (overrides: Partial<PulloutDetail> = {}) =>
  ({
    pulloutNo: "PLT-1",
    waybillNo: "WB-1",
    courierName: "LBC",
    scheduledAt: "2026-11-05T02:00:00.000Z",
    scheduledByName: "Logistics",
    status: { code: "pending_logistics", name: "Pending logistics", color: null },
    place: { id: "b1", name: "Branch A" },
    warehouse: { id: "w1", name: "Main", code: "W1" },
    reason: null,
    lines: [line()],
    ...overrides,
  }) as PulloutDetail;

const branchSlip = (pullout: PulloutDetail) => pulloutPrintDocument(pullout, "BRANCH");

describe("pulloutPrintDocument", () => {
  it("names the first page after the place the units leave", () => {
    expect(pulloutPrintDocument(detail(), "SERVICE CENTER")?.copyLegend).toEqual([
      "PAGE 1: SERVICE CENTER COPY",
      "PAGE 2: ACCOUNTING COPY",
    ]);
  });

  it("builds the Pull-out slip once the waybill, courier and schedule are saved", () => {
    expect(branchSlip(detail())).toEqual({
      title: "PULL-OUT SLIP",
      number: "PLT-1",
      customer: "Branch A",
      date: "Nov 5, 2026",
      address: "",
      detailColumns: ["Reason", "Remarks"],
      items: [{ modelCode: "SKU1", serialNo: "SN1", notes: [], details: ["Overstock", "Box dented"] }],
      copyLegend: ["PAGE 1: BRANCH COPY", "PAGE 2: ACCOUNTING COPY"],
      copiesPerPage: 2,
    });
  });

  it.each([
    ["waybill", { waybillNo: null }],
    ["courier", { courierName: " " }],
    ["schedule", { scheduledAt: null }],
  ])("is not ready without the %s", (_field, missing) => {
    expect(branchSlip(detail(missing))).toBeNull();
  });

  it("prints the Manila date for an early morning schedule", () => {
    // 1 AM on Nov 6 in Manila is still Nov 5 in UTC.
    expect(branchSlip(detail({ scheduledAt: "2026-11-05T17:00:00.000Z" }))?.date).toBe("Nov 6, 2026");
  });

  it("leaves rejected units off the slip", () => {
    const document = branchSlip(
      detail({ lines: [line(), line({ serialNo: "SN2", rejectedAt: "2026-11-05T02:00:00.000Z" })] }),
    );
    expect(document?.items).toHaveLength(1);
  });

  it("prints every checklist field recorded on the unit, one column each", () => {
    const document = branchSlip(
      detail({
        lines: [
          line({
            priorCode: "DEF",
            reasonName: "Defective unit",
            problemDescriptionNames: ["With line on screen", "No power"],
            classificationNames: ["Class A"],
            unitPackingConditionNames: ["Sealed box"],
            accessoryCompletenessNames: ["Complete", " "],
            remarks: "Horizontal Bars on Screen",
          }),
        ],
      }),
    );
    expect(document?.detailColumns).toEqual([
      "Reason",
      "Problem",
      "Classification",
      "Unit packing",
      "Acc completeness",
      "Remarks",
    ]);
    expect(document?.items[0]?.details).toEqual([
      "Defective unit",
      "With line on screen, No power",
      "Class A",
      "Sealed box",
      "Complete",
      "Horizontal Bars on Screen",
    ]);
  });

  it("keeps a column when any unit filled it in, blank for the units that did not", () => {
    const document = branchSlip(
      detail({
        lines: [line({ remarks: null }), line({ serialNo: "SN2", classificationNames: ["Class B"] })],
      }),
    );
    expect(document?.detailColumns).toEqual(["Reason", "Classification", "Remarks"]);
    expect(document?.items.map((item) => item.details)).toEqual([
      ["Overstock", "", ""],
      ["Overstock", "Class B", "Box dented"],
    ]);
  });

  it("falls back to an older pull-out's header reason, and prints no columns when nothing was recorded", () => {
    const older = branchSlip(
      detail({
        reason: { id: "r1", code: "OVR", name: "Overstock", color: null },
        lines: [line({ reasonName: null, remarks: null })],
      }),
    );
    const blank = branchSlip(detail({ lines: [line({ reasonName: null, remarks: "  " })] }));
    expect(older?.detailColumns).toEqual(["Reason"]);
    expect(older?.items[0]?.details).toEqual(["Overstock"]);
    expect(blank?.detailColumns).toEqual([]);
    expect(blank?.items[0]?.details).toEqual([]);
  });

  it("has no slip for a cancelled pull-out", () => {
    const status = { code: "cancelled", name: "Cancelled", color: null };
    expect(branchSlip(detail({ status }))).toBeNull();
  });
});

describe("slipsHtml", () => {
  const letterhead = { logo: null, companyName: "Acme", lines: ["Pasig City"] };

  it("stacks two Pull-out slip copies, each with the header, split by a cut line", () => {
    const slip = branchSlip(detail({ lines: [line({ remarks: "<b>Dented</b>" })] }));
    if (!slip) throw new Error("No slip");

    const html = slipsHtml([slip], letterhead);

    expect(html.match(/class="copy"/g)).toHaveLength(2);
    expect(html.match(/class="letterhead"/g)).toHaveLength(2);
    expect(html.match(/class="cut-line"/g)).toHaveLength(2);
    expect(html).toContain("No. <strong>PLT-1</strong>");
    expect(html).toContain("DESCRIPTION OF ITEM");
    expect(html).toContain("<tr><th>Item</th><th>Reason</th><th>Remarks</th></tr>");
    expect(html).toContain("Serial No.: SN1");
    expect(html).toContain("<td>&lt;b&gt;Dented&lt;/b&gt;</td>");
    expect(html.match(/Signature Over Printed Name/g)).toHaveLength(4);
    expect(html).toContain("<span>PAGE 1: BRANCH COPY</span><span>PAGE 2: ACCOUNTING COPY</span>");
  });

  it("prints one copy per slip and starts each slip on its own page", () => {
    const base = {
      customer: "Branch B",
      date: "Nov 6, 2026",
      address: "",
      items: [],
      copyLegend: ["PAGE 1: BRANCH COPY"],
      copiesPerPage: 1 as const,
    };
    const html = slipsHtml(
      [
        { ...base, title: "RELEASE SLIP", number: "XFR-1" },
        { ...base, title: "DELIVERY RECEIPT", number: "DR-1", reference: { label: "Ref RTV#:", value: "" } },
      ],
      null,
    );

    expect(html.match(/class="slip"/g)).toHaveLength(2);
    expect(html.match(/class="copy"/g)).toHaveLength(2);
    expect(html.match(/Ref RTV#:/g)).toHaveLength(1);
    expect(html).toContain("No units on this slip.");
  });
});

describe("other shipment slips", () => {
  it("prints a delivery or transfer slip with no waybill rows", () => {
    const document = shipmentPrintDocument({
      title: "Delivery",
      documentNo: "DLV-1",
      fields: [{ label: "Branch", value: "Branch A" }],
      lines: [{ model: "SKU1", detail: "SN1" }],
      lineHeaders: { model: "Model", detail: "Serial number" },
    });
    if (!document) throw new Error("No slip");

    const html = shipmentPrintHtml(document);

    expect(html).not.toContain("Waybill");
    expect(html).not.toContain("Schedule date");
    expect(html).toContain("Branch A");
  });

  it("keeps two columns when a document has no extra columns", () => {
    const document = shipmentPrintDocument({
      title: "Transfer",
      documentNo: "TR-1",
      shipment: { waybillNo: "WB-1", courierName: "LBC", scheduledAt: "2026-11-05", scheduledByName: null },
      fields: [],
      lines: [{ model: "SKU1", detail: "SN1" }],
      lineHeaders: { model: "Model", detail: "Serial number" },
    });
    if (!document) throw new Error("No slip");

    const html = shipmentPrintHtml(document);

    expect(html).toContain("<tr><th>Model</th><th>Serial number</th></tr>");
    expect(html).toContain("<tr><td>SKU1</td><td>SN1</td></tr>");
  });
});
