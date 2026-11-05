import { transferPrintDocument } from "@/app/(app)/logistics/_components/transfer-print";
import type { TransferDetail } from "@/features/logistics/services/transfer-posting.service";

const line = (overrides: Partial<TransferDetail["lines"][number]> = {}) =>
  ({
    serialNumberId: "s1",
    serialNo: "SN1",
    skuCode: "SKU1",
    modelName: "Model One",
    decision: "pending",
    remarks: null,
    requestRemarks: "For the mall display",
    ...overrides,
  }) as TransferDetail["lines"][number];

const detail = (overrides: Partial<TransferDetail> = {}) =>
  ({
    transferNo: "XFR-1",
    rsNo: "XFR-1",
    drNo: "DR-1",
    status: { code: "in_transit", name: "In transit", color: null },
    fromBranch: { id: "b1", name: "Branch A" },
    toBranch: { id: "b2", name: "Branch B" },
    shipment: {
      waybillNo: "WB-1",
      courierName: "LBC",
      scheduledAt: "2026-11-05",
      scheduledByName: "Logistics",
    },
    lines: [line()],
    ...overrides,
  }) as TransferDetail;

describe("transferPrintDocument", () => {
  it("stays off until Logistics saves the waybill, courier and schedule", () => {
    const shipment = { ...detail().shipment, waybillNo: null };
    expect(transferPrintDocument(detail({ shipment }))).toBeNull();
  });

  it("carries the waybill and the RS and DR numbers", () => {
    const document = transferPrintDocument(detail());
    expect(document?.waybillNo).toBe("WB-1");
    expect(document?.fields).toEqual(
      expect.arrayContaining([
        { label: "RS number", value: "XFR-1" },
        { label: "DR number", value: "DR-1" },
      ]),
    );
  });

  it("leaves the RS and DR numbers out before they are issued", () => {
    const document = transferPrintDocument(detail({ rsNo: null, drNo: null }));
    const labels = document?.fields.map((field) => field.label);
    expect(labels).toEqual(["Releasing branch", "Receiving branch"]);
  });

  it("prints each serial with its remark", () => {
    const document = transferPrintDocument(detail());
    expect(document?.extraHeaders).toEqual(["Remarks"]);
    expect(document?.lines).toEqual([
      { model: "SKU1 Model One", detail: "SN1", extras: ["For the mall display"] },
    ]);
  });

  it("leaves out serials the receiving branch rejected", () => {
    const lines = [line(), line({ serialNumberId: "s2", serialNo: "SN2", decision: "rejected" })];
    const document = transferPrintDocument(detail({ lines }));
    expect(document?.lines.map((row) => row.detail)).toEqual(["SN1"]);
  });

  it.each(["rejected", "cancelled"])("has nothing to print on a %s transfer", (code) => {
    const status = { code, name: code, color: null };
    expect(transferPrintDocument(detail({ status }))).toBeNull();
  });
});
