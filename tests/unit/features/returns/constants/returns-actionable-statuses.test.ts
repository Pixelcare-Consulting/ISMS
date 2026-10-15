import { getReturnsActionableApprovalStatuses } from "@/features/returns/constants/returns-actionable-statuses";

describe("getReturnsActionableApprovalStatuses", () => {
  it("includes only statuses the viewer can evaluate, approve, or complete", () => {
    expect(
      getReturnsActionableApprovalStatuses({
        canEvaluateReturn: true,
        canApproveReturn: false,
        canCompleteReturn: false,
      }),
    ).toEqual(["pending_cs"]);

    expect(
      getReturnsActionableApprovalStatuses({
        canEvaluateReturn: false,
        canApproveReturn: true,
        canCompleteReturn: true,
      }),
    ).toEqual(["pending_tl", "approved"]);
  });

  it("returns empty when the viewer has no Approvals actions", () => {
    expect(
      getReturnsActionableApprovalStatuses({
        canEvaluateReturn: false,
        canApproveReturn: false,
        canCompleteReturn: false,
      }),
    ).toEqual([]);
  });
});
