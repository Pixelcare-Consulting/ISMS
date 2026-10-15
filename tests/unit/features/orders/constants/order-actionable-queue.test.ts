import { getOrderActionableQueueStatuses } from "@/features/orders/constants/order-workflow";

describe("getOrderActionableQueueStatuses", () => {
  it("returns TL + SP steps for a Team Leader on manual orders (no drafts)", () => {
    expect(getOrderActionableQueueStatuses("manual", ["tl"])).toEqual([
      "pending_tl",
    ]);
  });

  it("returns SP step for Supply Planning on special orders", () => {
    expect(getOrderActionableQueueStatuses("special", ["sp"])).toEqual([
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
