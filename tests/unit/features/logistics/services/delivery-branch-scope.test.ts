jest.mock("@/lib/auth/permissions", () => ({
  hasPermission: (permissions: string[] | undefined, slug: string) =>
    Boolean(permissions?.includes(slug)),
}));
jest.mock("@/lib/database/client", () => ({ prisma: {} }));
jest.mock("@/features/stock-audit/services/stock-count-freeze", () => ({
  assertSerialsNotFrozenInStockCount: jest.fn(),
}));
jest.mock("@/lib/aor/scope", () => ({ getUserBranchIds: jest.fn() }));

import { authorizeBranchScope } from "@/features/logistics/services/posting-support";
import { getUserBranchIds } from "@/lib/aor/scope";

const mockedBranchIds = getUserBranchIds as jest.MockedFunction<typeof getUserBranchIds>;

const actor = { tenantId: "t1", userId: "u1", permissions: ["logistics.create"] };

describe("authorizeBranchScope (delivery accept / reject)", () => {
  beforeEach(() => mockedBranchIds.mockReset());

  it("allows a branch inside the user's area of responsibility", async () => {
    mockedBranchIds.mockResolvedValue(["b1", "b2"]);
    await expect(authorizeBranchScope(actor, "b1")).resolves.toBeUndefined();
  });

  it("rejects a branch outside the user's area of responsibility", async () => {
    mockedBranchIds.mockResolvedValue(["b2"]);
    await expect(authorizeBranchScope(actor, "b1")).rejects.toThrow(
      "This branch is outside your area of responsibility",
    );
  });

  it("skips the lookup for branches.manage", async () => {
    await expect(
      authorizeBranchScope({ ...actor, permissions: ["branches.manage"] }, "b1"),
    ).resolves.toBeUndefined();
    expect(mockedBranchIds).not.toHaveBeenCalled();
  });

  it("treats a user with no AOR rows as unrestricted, matching orders and transfers", async () => {
    mockedBranchIds.mockResolvedValue(null);
    await expect(authorizeBranchScope(actor, "b1")).resolves.toBeUndefined();
  });
});
