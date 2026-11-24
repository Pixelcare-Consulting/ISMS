import {
  approverBranchIds,
  canApproveTransferAt,
  transferApprovalBranchIds,
} from "@/features/logistics/lib/transfer-approver";

const APPROVE = "logistics.delivery_transfer.approve";

describe("transferApprovalBranchIds", () => {
  it("gives a holder of Transfers Approve only their assigned branches", () => {
    expect(transferApprovalBranchIds([APPROVE], ["b1", "b2"])).toEqual(["b1", "b2"]);
  });

  it("gives a holder with no AOR rows no branches, not every branch", () => {
    expect(transferApprovalBranchIds([APPROVE], null)).toEqual([]);
  });

  it("gives no branches without the checkbox, whatever the role slug", () => {
    expect(transferApprovalBranchIds(["tl", "super_admin", "branches.manage"], ["b1"])).toEqual([]);
    expect(transferApprovalBranchIds(undefined, ["b1"])).toEqual([]);
  });

  it("lets Manage branches approve on any branch", () => {
    expect(transferApprovalBranchIds([APPROVE, "branches.manage"], null)).toBeNull();
  });
});

describe("approverBranchIds", () => {
  it("checks the step's own checkbox", () => {
    expect(approverBranchIds(["inventory.defect.approve"], "inventory.defect.approve", ["b1"])).toEqual(["b1"]);
    expect(approverBranchIds([APPROVE], "inventory.defect.approve", ["b1"])).toEqual([]);
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
