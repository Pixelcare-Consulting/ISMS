import {
  scDeliveryHistory,
  scDeliveryReceiptLines,
} from "@/features/service-center-ops/lib/sc-delivery-detail";

const at = (iso: string) => new Date(iso);

describe("scDeliveryHistory", () => {
  it("maps the order approval, the SAP creation, and each accept to branch tracker actions", () => {
    const rows = scDeliveryHistory({
      deliveryId: "d1",
      createdAt: at("2026-11-17T03:00:00Z"),
      orderApprovedAt: at("2026-11-17T01:00:00Z"),
      audits: [
        { id: "a2", action: "sc_delivery.accepted", createdAt: at("2026-11-17T05:00:00Z"), userName: "Receiver" },
        { id: "a1", action: "sc_delivery.created_from_sap", createdAt: at("2026-11-17T03:00:00Z"), userName: "Logistics" },
        { id: "x", action: "sc_delivery.something_else", createdAt: at("2026-11-17T04:00:00Z"), userName: null },
      ],
    });

    expect(rows.map((row) => [row.action, row.userName])).toEqual([
      ["delivery.created_from_order", null],
      ["delivery.dispatched_in_sap", "Logistics"],
      ["delivery.accepted", "Receiver"],
    ]);
  });

  it("uses the delivery's creation when no creation entry was logged (pull-out redelivery)", () => {
    const rows = scDeliveryHistory({
      deliveryId: "d2",
      createdAt: at("2026-11-17T03:00:00Z"),
      orderApprovedAt: null,
      audits: [],
    });

    expect(rows).toEqual([
      {
        id: "d2:created",
        action: "delivery.dispatched_in_sap",
        at: "2026-11-17T03:00:00.000Z",
        userName: null,
      },
    ]);
  });
});

describe("scDeliveryReceiptLines", () => {
  it("lists open units as in transit and accepted ones as received", () => {
    const lines = scDeliveryReceiptLines([
      { serialNumberId: "s1", serialNo: "SN1", skuCode: "M1", modelName: "Model 1", acceptedAt: null },
      { serialNumberId: "s2", serialNo: "SN2", skuCode: "M1", modelName: "Model 1", acceptedAt: at("2026-11-17T05:00:00Z") },
    ]);

    expect(lines.map((line) => [line.serialNumberId, line.state, line.inTransit])).toEqual([
      ["s1", "IN_TRANSIT", true],
      ["s2", "RECEIVED", false],
    ]);
    expect(lines.every((line) => line.openTransfer === null && line.openReturn === null)).toBe(true);
  });
});
