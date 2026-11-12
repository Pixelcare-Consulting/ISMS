import {
  canApproveTransferAt,
  transferApprovalBranchIds,
} from "@/features/logistics/lib/transfer-approver";

describe("transferApprovalBranchIds", () => {
  it("gives a team leader only their assigned branches", () => {
    expect(transferApprovalBranchIds(["tl"], ["b1", "b2"])).toEqual(["b1", "b2"]);
  });

  it("gives a team leader with no AOR rows no branches, not every branch", () => {
    expect(transferApprovalBranchIds(["tl"], null)).toEqual([]);
  });

  it("gives other roles no branches, even with an AOR", () => {
    expect(transferApprovalBranchIds(["logistics", "tenant_admin"], ["b1"])).toEqual([]);
    expect(transferApprovalBranchIds(undefined, ["b1"])).toEqual([]);
  });

  it("lets a super admin step in on any branch", () => {
    expect(transferApprovalBranchIds(["super_admin"], null)).toBeNull();
  });
});

describe("canApproveTransferAt", () => {
  it("matches the releasing branch against the approval branches", () => {
    expect(canApproveTransferAt(["b1"], "b1")).toBe(true);
    expect(canApproveTransferAt(["b1"], "b2")).toBe(false);
    expect(canApproveTransferAt([], "b1")).toBe(false);
    expect(canApproveTransferAt(null, "b1")).toBe(true);
  });
});
