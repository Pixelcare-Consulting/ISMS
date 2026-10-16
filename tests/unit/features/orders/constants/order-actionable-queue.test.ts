import { getOrderActionableQueueStatuses } from "@/features/orders/constants/order-workflow";

describe("getOrderActionableQueueStatuses", () => {
  it("does not badge Team Leaders for Manual pending_sp (edit-only, not approve)", () => {
    expect(getOrderActionableQueueStatuses("manual", ["tl"])).toEqual([]);
  });

  it("returns SP step for Supply Planning on special orders", () => {
    expect(getOrderActionableQueueStatuses("special", ["sp"])).toEqual([
      "pending_sp",
    ]);
  });

  it("returns SP step for Supply Planning on manual orders", () => {
    expect(getOrderActionableQueueStatuses("manual", ["sp"])).toEqual([
      "pending_sp",
    ]);
  });

  it("keeps legacy pending_ps for Product Specialists on manual orders", () => {
    expect(getOrderActionableQueueStatuses("manual", ["ps"])).toEqual([
      "pending_ps",
    ]);
  });

  it("returns empty when the role cannot approve any live step", () => {
    expect(getOrderActionableQueueStatuses("special", ["tl"])).toEqual([]);
  });

  it("lets oversight roles see every pending step except draft", () => {
    expect(getOrderActionableQueueStatuses("manual", ["tenant_admin"])).toEqual([
      "pending_ps",
      "pending_tl",
      "pending_sp",
      "pending_logistics",
    ]);
  });
});
