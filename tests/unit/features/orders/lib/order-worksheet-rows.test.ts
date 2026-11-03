import { approvedQtyForRow, draftsForOrderLines } from "@/features/orders/lib/order-worksheet-rows";
import type { OrderWorksheetLine } from "@/features/orders/types/order-analytics";

describe("approvedQtyForRow", () => {
  it("approves the request until Supply Planning changes it", () => {
    expect(approvedQtyForRow(4, null)).toBe(4);
    expect(approvedQtyForRow(0, null)).toBeNull();
  });

  it("keeps 0, lower, higher, and unrequested approvals as typed", () => {
    expect(approvedQtyForRow(4, 0)).toBe(0);
    expect(approvedQtyForRow(4, 2)).toBe(2);
    expect(approvedQtyForRow(4, 9)).toBe(9);
    expect(approvedQtyForRow(0, 3)).toBe(3);
  });

  it("falls back to the request for a value that is not a whole number of 0 or more", () => {
    expect(approvedQtyForRow(4, -1)).toBe(4);
    expect(approvedQtyForRow(4, 1.5)).toBe(4);
  });
});

describe("draftsForOrderLines", () => {
  it("keeps a saved approval on a line that had no request", () => {
    const sheet = [{ modelId: "m1" }, { modelId: "m2" }] as OrderWorksheetLine[];
    const drafts = draftsForOrderLines(sheet, [{ modelId: "m1", quantity: 0, approvedQty: 3 }]);
    expect(drafts.m1?.approvedQty).toBe(3);
    expect(drafts.m2?.approvedQty).toBeNull();
  });
});
