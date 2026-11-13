import {
  transferPrintDocument,
  transferSlipDocuments,
} from "@/app/(app)/logistics/_components/transfer-print";
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
    lines: [line()],
    // 1 AM on Nov 6 in Manila.
    history: [{ id: "h1", action: "transfer.approved", at: "2026-11-05T17:00:00.000Z", userName: "TL" }],
    ...overrides,
  }) as TransferDetail;

describe("transferPrintDocument", () => {
  it("prints the release slip and the delivery receipt for the receiving branch", () => {
    const slips = transferPrintDocument(detail());
    expect(slips?.map((slip) => [slip.title, slip.number])).toEqual([
      ["TRANSFER RELEASE SLIP", "XFR-1"],
      ["TRANSFER DELIVERY SLIP", "DR-1"],
    ]);
    expect(slips?.[1]).toMatchObject({
      customer: "Branch B",
      date: "Nov 6, 2026",
      address: "",
      reference: { label: "Ref RTV#:", value: "" },
      copyLegend: ["PAGE 1: BRANCH COPY", "PAGE 2: ACCOUNTING COPY", "PAGE 3: DEMAND COPY"],
      copiesPerPage: 1,
    });
  });

  it("marks each unit as a stock transfer, with its request remark", () => {
    const lines = [line(), line({ serialNumberId: "s2", serialNo: "SN2", requestRemarks: " " })];
    expect(transferPrintDocument(detail({ lines }))?.[1]?.items).toEqual([
      { modelCode: "SKU1", serialNo: "SN1", note: "Remarks: Stock transfer / For the mall display" },
      { modelCode: "SKU1", serialNo: "SN2", note: "Remarks: Stock transfer" },
    ]);
  });

  it("leaves out serials the receiving branch rejected", () => {
    const lines = [line(), line({ serialNumberId: "s2", serialNo: "SN2", decision: "rejected" })];
    expect(transferPrintDocument(detail({ lines }))?.[0]?.items.map((item) => item.serialNo)).toEqual(["SN1"]);
  });

  it("has nothing to print before the RS and DR numbers are issued", () => {
    expect(transferPrintDocument(detail({ rsNo: null, drNo: null }))).toBeNull();
  });

  it.each(["draft", "requested", "pending_tl"])("stays off before Team Lead approval (%s)", (code) => {
    const status = { code, name: code, color: null };
    expect(transferPrintDocument(detail({ status }))).toBeNull();
  });

  it.each(["approved", "for_transfer", "in_transit", "accepted", "completed"])(
    "prints from approval onward (%s)",
    (code) => {
      const status = { code, name: code, color: null };
      expect(transferPrintDocument(detail({ status }))).not.toBeNull();
    },
  );

  it.each(["rejected", "cancelled"])("has nothing to print on a %s transfer", (code) => {
    const status = { code, name: code, color: null };
    expect(transferPrintDocument(detail({ status }))).toBeNull();
  });
});

describe("transferSlipDocuments", () => {
  it("prints right after approval with the new numbers, dated today", () => {
    const pending = detail({ rsNo: null, drNo: null, history: [] });
    const slips = transferSlipDocuments(pending, { rsNo: "XFR-1", drNo: "DR-9" }, new Date("2026-11-13T03:00:00Z"));
    expect(slips.map((slip) => [slip.number, slip.date])).toEqual([
      ["XFR-1", "Nov 13, 2026"],
      ["DR-9", "Nov 13, 2026"],
    ]);
  });
});
