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
    branch: { id: "b1", name: "Branch A" },
    warehouse: { id: "w1", name: "Main", code: "W1" },
    reason: null,
    lines: [line()],
    ...overrides,
  }) as PulloutDetail;

describe("pulloutPrintDocument", () => {
  it("builds the Return Slip once the waybill, courier and schedule are saved", () => {
    expect(pulloutPrintDocument(detail())).toEqual({
      title: "RETURN SLIP",
      number: "PLT-1",
      customer: "Branch A",
      date: "Nov 5, 2026",
      address: "",
      items: [{ modelCode: "SKU1", serialNo: "SN1", note: "OVERSTOCK / Remarks: Box dented" }],
      copyLegend: ["PAGE 1: BRANCH COPY", "PAGE 2: ACCOUNTING COPY"],
      copiesPerPage: 2,
    });
  });

  it.each([
    ["waybill", { waybillNo: null }],
    ["courier", { courierName: " " }],
    ["schedule", { scheduledAt: null }],
  ])("is not ready without the %s", (_field, missing) => {
    expect(pulloutPrintDocument(detail(missing))).toBeNull();
  });

  it("prints the Manila date for an early morning schedule", () => {
    // 1 AM on Nov 6 in Manila is still Nov 5 in UTC.
    expect(pulloutPrintDocument(detail({ scheduledAt: "2026-11-05T17:00:00.000Z" }))?.date).toBe("Nov 6, 2026");
  });

  it("leaves rejected units off the slip", () => {
    const document = pulloutPrintDocument(
      detail({ lines: [line(), line({ serialNo: "SN2", rejectedAt: "2026-11-05T02:00:00.000Z" })] }),
    );
    expect(document?.items).toHaveLength(1);
  });

  it("prints a defective unit's reason and problems like the client's slip", () => {
    const document = pulloutPrintDocument(
      detail({
        lines: [
          line({
            priorCode: "DEF",
            reasonName: "Defective unit",
            problemDescriptionNames: ["With line on screen"],
            remarks: "Horizontal Bars on Screen",
          }),
        ],
      }),
    );
    expect(document?.items[0]?.note).toBe(
      "DEFECTIVE UNIT / WITH LINE ON SCREEN / Remarks: Horizontal Bars on Screen",
    );
  });

  it("falls back to an older pull-out's header reason, and prints no note when nothing was recorded", () => {
    const older = pulloutPrintDocument(
      detail({
        reason: { id: "r1", code: "OVR", name: "Overstock", color: null },
        lines: [line({ reasonName: null, remarks: null })],
      }),
    );
    const blank = pulloutPrintDocument(detail({ lines: [line({ reasonName: null, remarks: "  " })] }));
    expect(older?.items[0]?.note).toBe("OVERSTOCK");
    expect(blank?.items[0]?.note).toBe("");
  });

  it("has no slip for a cancelled pull-out", () => {
    const status = { code: "cancelled", name: "Cancelled", color: null };
    expect(pulloutPrintDocument(detail({ status }))).toBeNull();
  });
});

describe("slipsHtml", () => {
  const letterhead = { logo: null, companyName: "Acme", lines: ["Pasig City"] };

  it("stacks two Return Slip copies, each with the header, split by a cut line", () => {
    const slip = pulloutPrintDocument(detail({ lines: [line({ remarks: "<b>Dented</b>" })] }));
    if (!slip) throw new Error("No slip");

    const html = slipsHtml([slip], letterhead);

    expect(html.match(/class="copy"/g)).toHaveLength(2);
    expect(html.match(/class="letterhead"/g)).toHaveLength(2);
    expect(html.match(/class="cut-line"/g)).toHaveLength(2);
    expect(html).toContain("No. <strong>PLT-1</strong>");
    expect(html).toContain("DESCRIPTION OF ITEM");
    expect(html).toContain("Serial No.: SN1");
    expect(html).toContain("Remarks: &lt;b&gt;Dented&lt;/b&gt;");
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
