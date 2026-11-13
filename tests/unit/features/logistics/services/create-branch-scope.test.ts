jest.mock("@/lib/database/client", () => ({ prisma: {} }));
jest.mock("@/lib/aor/scope", () => ({ getUserBranchIds: jest.fn() }));
jest.mock("@/lib/auth", () => ({ auth: jest.fn() }));

import { authorizeCreateBranches } from "@/features/logistics/services/posting-support";
import { getUserBranchIds } from "@/lib/aor/scope";

const branchIds = jest.mocked(getUserBranchIds);
const actor = { tenantId: "t1", userId: "u1", roleSlugs: [], permissions: ["branches.manage"] };

beforeEach(() => jest.clearAllMocks());

describe("create scope for transfers and pull-outs", () => {
  it("allows branches in the person's area of responsibility", async () => {
    branchIds.mockResolvedValue(["b1", "b2"]);
    await expect(authorizeCreateBranches(actor, ["b1", "b2"])).resolves.toBeUndefined();
    expect(branchIds).toHaveBeenCalledWith("t1", "u1");
  });

  it("refuses a branch outside it, even with branches.manage", async () => {
    branchIds.mockResolvedValue(["b1"]);
    await expect(authorizeCreateBranches(actor, ["b1", "b2"])).rejects.toThrow(
      "This branch is outside your area of responsibility",
    );
  });

  it("allows every branch to someone with no AOR rows", async () => {
    branchIds.mockResolvedValue(null);
    await expect(authorizeCreateBranches(actor, ["b9"])).resolves.toBeUndefined();
  });
});
