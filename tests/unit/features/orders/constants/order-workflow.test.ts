import type { BranchOrderStatus } from "@prisma/client";

import {
  canDeleteDraftOrder,
  canEditOrderLines,
  canOptionallyEditManualOrder,
  declineOrderStatus,
  getInitialOrderStatus,
  getOrderQueueStatuses,
  isOrderEditable,
  nextStatusAfterApprove,
} from "@/features/orders/constants/order-workflow";

const ALL_BRANCH_ORDER_STATUSES = [
  "draft",
  "pending_ps",
  "pending_tl",
  "pending_sp",
  "pending_logistics",
  "approved",
  "rejected",
  "cancelled",
] as const satisfies readonly BranchOrderStatus[];

describe("Process II order path", () => {
  it("sends a submitted manual order straight to Supply Planning", () => {
    expect(getInitialOrderStatus("manual")).toBe("pending_sp");
    expect(nextStatusAfterApprove("pending_sp", "manual")).toBe("approved");
  });

  it("skips Team Leader for leftover manual pending_ps approvals", () => {
    expect(nextStatusAfterApprove("pending_ps", "manual")).toBe("pending_sp");
  });

  it("cancels when Supply Planning declines and rejects earlier leftover steps", () => {
    expect(declineOrderStatus("pending_sp", "manual")).toBe("cancelled");
    expect(declineOrderStatus("pending_ps", "manual")).toBe("rejected");
  });

  it("keeps Manual editable while Pending SP and freezes other live statuses", () => {
    expect(isOrderEditable("draft")).toBe(true);
    expect(isOrderEditable("pending_sp", "manual")).toBe(true);
    expect(isOrderEditable("pending_sp", "special")).toBe(false);
    expect(isOrderEditable("approved", "manual")).toBe(false);
  });

  it("lets PS/TL optionally edit Manual Pending SP without create permission", () => {
    expect(canOptionallyEditManualOrder(["tl"])).toBe(true);
    expect(
      canEditOrderLines({
        status: "pending_sp",
        orderType: "manual",
        roleSlugs: ["tl"],
        hasCreatePermission: false,
      }),
    ).toBe(true);
    expect(
      canEditOrderLines({
        status: "pending_sp",
        orderType: "manual",
        roleSlugs: ["logistics"],
        hasCreatePermission: false,
      }),
    ).toBe(false);
  });

  it("shows Manual pending_sp in the PS/TL list queue for optional edit", () => {
    expect(getOrderQueueStatuses("manual", ["tl"])).toEqual(["pending_sp"]);
    expect(getOrderQueueStatuses("manual", ["ps"], { includeDraft: true })).toEqual([
      "draft",
      "pending_ps",
      "pending_sp",
    ]);
  });

  it("allows hard-delete only for draft status", () => {
    expect(canDeleteDraftOrder({ status: "draft" })).toBe(true);
    for (const status of ALL_BRANCH_ORDER_STATUSES) {
      if (status === "draft") continue;
      expect(canDeleteDraftOrder({ status })).toBe(false);
    }
  });
});
