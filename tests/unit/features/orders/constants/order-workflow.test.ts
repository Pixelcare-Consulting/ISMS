import type { BranchOrderStatus } from "@prisma/client";

import {
  canAdminForceCancelOrder,
  canApproveOrder,
  canCancelApprovedOrder,
  canDeleteDraftOrder,
  canEditOrderLines,
  canOptionallyEditManualOrder,
  canPersistSpRemarks,
  declineOrderStatus,
  getInitialOrderStatus,
  getOrderApprovalChain,
  getOrderQueueStatuses,
  isOrderEditable,
  isOwnOrdersOnly,
  mayViewOrder,
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

  it("lets Edit while Pending SP change Manual lines without create permission", () => {
    expect(canOptionallyEditManualOrder(["orders.manual.edit_pending"])).toBe(true);
    expect(canOptionallyEditManualOrder(["tl", "ps"])).toBe(false);
    expect(
      canEditOrderLines({
        status: "pending_sp",
        orderType: "manual",
        permissions: ["orders.manual.edit_pending"],
        hasCreatePermission: false,
      }),
    ).toBe(true);
    expect(
      canEditOrderLines({
        status: "pending_sp",
        orderType: "manual",
        permissions: ["orders.manual.view"],
        hasCreatePermission: false,
      }),
    ).toBe(false);
  });

  it("shows Manual pending_sp in the queue for optional edit", () => {
    expect(getOrderQueueStatuses("manual", ["orders.manual.edit_pending"])).toEqual(["pending_sp"]);
    expect(
      getOrderQueueStatuses("manual", ["orders.manual.edit_pending"], { includeDraft: true }),
    ).toEqual(["draft", "pending_sp"]);
  });

  it("shows every live step with See every pending step", () => {
    expect(getOrderQueueStatuses("special", ["orders.special.view_queue"])).toEqual([
      "draft",
      "pending_ps",
      "pending_tl",
      "pending_sp",
      "pending_logistics",
    ]);
    expect(getOrderQueueStatuses("special", ["orders.manual.view_queue"])).toEqual([]);
  });

  it("allows hard-delete only for draft status", () => {
    expect(canDeleteDraftOrder({ status: "draft" })).toBe(true);
    for (const status of ALL_BRANCH_ORDER_STATUSES) {
      if (status === "draft") continue;
      expect(canDeleteDraftOrder({ status })).toBe(false);
    }
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

describe("workflow step checkboxes", () => {
  it("names each approval step's checkbox after the step", () => {
    expect(getOrderApprovalChain("auto_replenish").map((step) => step.permission)).toEqual([
      "orders.auto_replenish.approve_tl",
      "orders.auto_replenish.approve_sp",
    ]);
    expect(getOrderApprovalChain("manual").map((step) => step.permission)).toEqual([
      "orders.manual.approve_sp",
    ]);
  });

  it("lets only the step's checkbox approve, never a role slug or the old Approve", () => {
    expect(canApproveOrder("pending_tl", "auto_replenish", ["orders.auto_replenish.approve_tl"])).toBe(true);
    expect(canApproveOrder("pending_sp", "auto_replenish", ["orders.auto_replenish.approve_tl"])).toBe(false);
    expect(canApproveOrder("pending_sp", "auto_replenish", ["orders.auto_replenish.approve_sp"])).toBe(true);
    expect(canApproveOrder("pending_sp", "manual", ["orders.special.approve_sp"])).toBe(false);
    expect(canApproveOrder("pending_tl", "auto_replenish", ["tl"])).toBe(false);
    expect(canApproveOrder("pending_sp", "manual", ["sp", "orders.manual.approve", "orders.approve"])).toBe(false);
  });

  it("lets one person hold both auto replenish steps", () => {
    const both = ["orders.auto_replenish.approve_tl", "orders.auto_replenish.approve_sp"];
    expect(canApproveOrder("pending_tl", "auto_replenish", both)).toBe(true);
    expect(canApproveOrder("pending_sp", "auto_replenish", both)).toBe(true);
  });

  it("sends legacy pending_ps and pending_logistics to the Supply Planning step", () => {
    expect(canApproveOrder("pending_ps", "manual", ["orders.manual.approve_sp"])).toBe(true);
    expect(canApproveOrder("pending_logistics", "special", ["orders.special.approve_sp"])).toBe(true);
    expect(canApproveOrder("pending_logistics", "special", ["logistics"])).toBe(false);
  });

  it("keeps SP remarks and Cancel approved on the Supply Planning step", () => {
    expect(canPersistSpRemarks("pending_sp", "manual", ["orders.manual.approve_sp"])).toBe(true);
    expect(canPersistSpRemarks("pending_tl", "auto_replenish", ["orders.auto_replenish.approve_sp"])).toBe(false);
    const approved = {
      status: "approved" as const,
      orderType: "manual" as const,
      source: "ISMS" as const,
      sapDocEntry: 12,
    };
    expect(canCancelApprovedOrder(approved, ["orders.manual.approve_sp"])).toBe(true);
    expect(canCancelApprovedOrder(approved, ["orders.special.approve_sp"])).toBe(false);
    expect(canCancelApprovedOrder({ ...approved, sapDocEntry: null }, ["orders.manual.approve_sp"])).toBe(false);
  });

  it("limits manual and special lists to own orders without See everyone's orders", () => {
    expect(isOwnOrdersOnly("manual", ["orders.manual.view"])).toBe(true);
    expect(isOwnOrdersOnly("manual", ["orders.manual.view_all"])).toBe(false);
    expect(isOwnOrdersOnly("special", ["orders.manual.view_all"])).toBe(true);
    expect(isOwnOrdersOnly("auto_replenish", [])).toBe(false);
    expect(
      mayViewOrder({ orderType: "manual", permissions: [], viewerUserId: "u1", createdById: "u2" }),
    ).toBe(false);
    expect(
      mayViewOrder({ orderType: "manual", permissions: [], viewerUserId: "u1", createdById: "u1" }),
    ).toBe(true);
  });
});
