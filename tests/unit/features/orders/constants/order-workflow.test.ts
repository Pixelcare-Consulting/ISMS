import {
  declineOrderStatus,
  getInitialOrderStatus,
  nextStatusAfterApprove,
} from "@/features/orders/constants/order-workflow";

describe("Process II order path", () => {
  it("sends a submitted manual order to Team Leader review", () => {
    expect(getInitialOrderStatus("manual")).toBe("pending_tl");
    expect(nextStatusAfterApprove("pending_tl", "manual")).toBe("pending_sp");
    expect(nextStatusAfterApprove("pending_sp", "manual")).toBe("approved");
  });

  it("cancels when Supply Planning declines and rejects earlier steps", () => {
    expect(declineOrderStatus("pending_sp", "manual")).toBe("cancelled");
    expect(declineOrderStatus("pending_tl", "manual")).toBe("rejected");
  });
});
