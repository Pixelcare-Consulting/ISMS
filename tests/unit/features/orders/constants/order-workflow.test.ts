import type { BranchOrderStatus } from "@prisma/client";

import {
  canAdminForceCancelOrder,
  canDeleteDraftOrder,
  canEditOrderLines,
  canOptionallyEditManualOrder,
  declineOrderStatus,
  getInitialOrderStatus,
  getOrderQueueStatuses,
  isOrderEditable,
  isSuperAdminOrderOverride,
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

  it("enables Super Admin bulk override only for super_admin", () => {
    expect(isSuperAdminOrderOverride(["super_admin"])).toBe(true);
    expect(isSuperAdminOrderOverride(["super_admin", "tenant_admin"])).toBe(true);
    expect(isSuperAdminOrderOverride(["tenant_admin"])).toBe(false);
    expect(isSuperAdminOrderOverride(["sp"])).toBe(false);
  });

  it("allows admin force-cancel only for live pending queue statuses", () => {
    expect(canAdminForceCancelOrder({ status: "pending_ps" })).toBe(true);
    expect(canAdminForceCancelOrder({ status: "pending_tl" })).toBe(true);
    expect(canAdminForceCancelOrder({ status: "pending_sp" })).toBe(true);
    expect(canAdminForceCancelOrder({ status: "pending_logistics" })).toBe(true);
    expect(canAdminForceCancelOrder({ status: "draft" })).toBe(false);
    expect(canAdminForceCancelOrder({ status: "approved" })).toBe(false);
    expect(canAdminForceCancelOrder({ status: "rejected" })).toBe(false);
    expect(canAdminForceCancelOrder({ status: "cancelled" })).toBe(false);
  });
});
