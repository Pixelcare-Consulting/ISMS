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
    expect(transferActionableWhere(["branch-b"], { ...none, canReceiveTransfer: true })).toEqual({
      OR: [{ toBranchId: { in: ["branch-b"] }, statusCode: { code: { in: ["in_transit"] } } }],
    });
  });
});
