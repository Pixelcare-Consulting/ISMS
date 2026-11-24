import { getOrderActionableQueueStatuses } from "@/features/orders/constants/order-workflow";

describe("getOrderActionableQueueStatuses", () => {
  it("does not badge Edit while Pending SP (edit-only, not approve)", () => {
    expect(getOrderActionableQueueStatuses("manual", ["orders.manual.edit_pending"])).toEqual([]);
  });

  it("returns the SP step (and legacy pending_logistics) for Supply Planning on special orders", () => {
    expect(getOrderActionableQueueStatuses("special", ["orders.special.approve_sp"])).toEqual([
      "pending_sp",
      "pending_logistics",
    ]);
  });

  it("returns the SP step and legacy steps for Supply Planning approval on manual orders", () => {
    expect(getOrderActionableQueueStatuses("manual", ["orders.manual.approve_sp"])).toEqual([
      "pending_ps",
      "pending_sp",
      "pending_logistics",
    ]);
  });

  it("returns the TL step for Team Leader review on auto replenish", () => {
    expect(
      getOrderActionableQueueStatuses("auto_replenish", ["orders.auto_replenish.approve_tl"]),
    ).toEqual(["pending_tl"]);
  });

  it("returns empty for role slugs or another type's checkbox", () => {
    expect(getOrderActionableQueueStatuses("special", ["tl", "sp"])).toEqual([]);
    expect(getOrderActionableQueueStatuses("special", ["orders.manual.approve_sp"])).toEqual([]);
  });

  it("lets See every pending step count every pending step except draft", () => {
    expect(getOrderActionableQueueStatuses("manual", ["orders.manual.view_queue"])).toEqual([
      "pending_ps",
      "pending_tl",
      "pending_sp",
      "pending_logistics",
    ]);
  });
});
