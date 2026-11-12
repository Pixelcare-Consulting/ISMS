jest.mock("@/lib/aor/scope", () => ({ getUserBranchIds: jest.fn() }));
jest.mock("@/lib/auth/permissions", () => ({
  hasPermission: (permissions: string[] | undefined, slug: string) =>
    Boolean(permissions?.includes(slug)),
}));

import { transferActionableWhere } from "@/features/logistics/lib/transfer-visibility";

const none = {
  canApproveTl: false,
  canRejectTransfer: false,
  canExecuteTransfer: false,
  canReceiveTransfer: false,
};

describe("transferActionableWhere", () => {
  it("counts a transfer for the receiving branch only once Logistics has released it", () => {
    expect(transferActionableWhere(["branch-b"], { ...none, canReceiveTransfer: true }, [])).toEqual({
      OR: [{ toBranchId: { in: ["branch-b"] }, statusCode: { code: { in: ["in_transit"] } } }],
    });
  });

  it("counts an approval only on the branches this person can approve for", () => {
    expect(
      transferActionableWhere(["branch-a", "branch-b"], { ...none, canApproveTl: true }, ["branch-a"]),
    ).toEqual({
      OR: [
        { fromBranchId: { in: ["branch-a"] }, statusCode: { code: { in: ["pending_tl", "requested"] } } },
        { toBranchId: { in: ["branch-a", "branch-b"] }, statusCode: { code: { in: ["in_transit"] } } },
      ],
    });
  });

  it("does not count approvals for someone with the permission but no approval branches", () => {
    expect(transferActionableWhere(["branch-a"], { ...none, canRejectTransfer: true }, [])).toBeNull();
  });

  it("counts every branch's approvals for a super admin", () => {
    expect(transferActionableWhere(null, { ...none, canRejectTransfer: true }, null)).toEqual({
      OR: [{ statusCode: { code: { in: ["pending_tl", "requested"] } } }],
    });
  });
});
