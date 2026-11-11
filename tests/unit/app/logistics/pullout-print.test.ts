import { pulloutPrintDocument } from "@/app/(app)/logistics/_components/pullout-print";
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
  it("builds the slip once the waybill, courier and schedule are saved", () => {
    expect(pulloutPrintDocument(detail())).toEqual({
      title: "Pull-out",
      documentNo: "PLT-1",
      waybillNo: "WB-1",
      courierName: "LBC",
      scheduleDate: "Nov 5, 2026",
      fields: [
        { label: "Branch", value: "Branch A" },
        { label: "Destination warehouse", value: "Main (W1)" },
      ],
      lines: [
        { model: "SKU1 Model One", detail: "SN1 · STK", extras: ["Overstock", "Box dented"] },
      ],
      lineHeaders: { model: "Model", detail: "Serial number" },
      extraHeaders: ["Reason", "Remarks"],
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
    const document = pulloutPrintDocument(detail({ scheduledAt: "2026-11-05T17:00:00.000Z" }));

    expect(document?.scheduleDate).toBe("Nov 6, 2026");
  });

  it("leaves rejected units off the slip", () => {
    const document = pulloutPrintDocument(
      detail({
        lines: [line(), line({ serialNo: "SN2", rejectedAt: "2026-11-05T02:00:00.000Z" })],
      }),
    );

    expect(document?.lines).toHaveLength(1);
  });

  it("prints a defective unit's reason with its problems", () => {
    const document = pulloutPrintDocument(
      detail({
        lines: [
          line({
            priorCode: "DEF",
            reasonName: "Defective units",
            problemDescriptionNames: ["No power", "Cracked panel"],
          }),
        ],
      }),
    );

    expect(document?.lines[0]?.extras?.[0]).toBe("Defective units: No power, Cracked panel");
  });

  it("falls back to an older pull-out's header reason, and a dash when nothing was recorded", () => {
    const older = pulloutPrintDocument(
      detail({
        reason: { id: "r1", code: "OVR", name: "Overstock", color: null },
        lines: [line({ reasonName: null, remarks: null })],
      }),
    );
    const blank = pulloutPrintDocument(
      detail({ lines: [line({ reasonName: null, remarks: "  " })] }),
    );

    expect(older?.lines[0]?.extras).toEqual(["Overstock", "—"]);
    expect(blank?.lines[0]?.extras).toEqual(["—", "—"]);
  });

  it("puts reason and remarks in their own columns, escaped", () => {
    const document = pulloutPrintDocument(detail({ lines: [line({ remarks: "<b>Dented</b>" })] }));
    if (!document) throw new Error("No slip");

    const html = shipmentPrintHtml(document);

    expect(html).toContain("<th>Reason</th><th>Remarks</th>");
    expect(html).toContain("<td>Overstock</td><td>&lt;b&gt;Dented&lt;/b&gt;</td>");
  });

  it("has no slip for a cancelled pull-out", () => {
    const status = { code: "cancelled", name: "Cancelled", color: null };

    expect(pulloutPrintDocument(detail({ status }))).toBeNull();
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
