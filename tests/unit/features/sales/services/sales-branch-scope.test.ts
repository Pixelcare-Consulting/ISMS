jest.mock("@/lib/aor/scope", () => ({
  getUserBranchIds: jest.fn(),
}));

jest.mock("@/lib/auth/permissions", () => ({
  hasPermission: (permissions: string[] | undefined, slug: string) =>
    Boolean(permissions?.includes(slug)),
}));

import { getUserBranchIds } from "@/lib/aor/scope";
import { resolveSoldBranchScope } from "@/features/sales/services/sales-branch-scope";
import { salesListDetailWhere } from "@/features/sales/constants/sales-list-status";

const getUserBranchIdsMock = getUserBranchIds as jest.Mock;

describe("resolveSoldBranchScope", () => {
  beforeEach(() => getUserBranchIdsMock.mockReset());

  it("is unrestricted for branch managers without reading AOR", async () => {
    await expect(
      resolveSoldBranchScope("t1", "u1", ["sales.view", "branches.manage"]),
    ).resolves.toBeNull();
    expect(getUserBranchIdsMock).not.toHaveBeenCalled();
  });

  it("returns the user's AOR branches", async () => {
    getUserBranchIdsMock.mockResolvedValue(["b1", "b2"]);
    await expect(resolveSoldBranchScope("t1", "u1", ["sales.view"])).resolves.toEqual([
      "b1",
      "b2",
    ]);
  });

  it("stays unrestricted when the user has no AOR rows", async () => {
    getUserBranchIdsMock.mockResolvedValue(null);
    await expect(resolveSoldBranchScope("t1", "u1", ["sales.view"])).resolves.toBeNull();
  });
});

describe("salesListDetailWhere sold-branch scope", () => {
  function saleClause(where: ReturnType<typeof salesListDetailWhere>) {
    const and = where.AND as Array<{ sale?: Record<string, unknown> }>;
    return and[0]!.sale!;
  }

  it("filters on the sold branch when scoped", () => {
    expect(saleClause(salesListDetailWhere("t1", ["b1"]))).toMatchObject({
      tenantId: "t1",
      branchId: { in: ["b1"] },
    });
  });

  it("adds no branch filter when unrestricted", () => {
    expect(saleClause(salesListDetailWhere("t1", null))).not.toHaveProperty("branchId");
    expect(saleClause(salesListDetailWhere("t1"))).not.toHaveProperty("branchId");
  });
});
