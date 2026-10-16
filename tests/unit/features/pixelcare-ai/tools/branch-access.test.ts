jest.mock("@/lib/auth/permissions", () => ({
  hasPermission: (permissions: string[] | undefined, permission: string) =>
    permissions?.includes(permission) ?? false,
}));
jest.mock("@/features/aors/services/aor.service", () => ({
  aorService: {
    getBranchIdsForUser: jest.fn(),
  },
}));
jest.mock("@/features/branches/repositories/branch.repository", () => ({
  branchRepository: {
    listByTenant: jest.fn(),
  },
}));

import { aorService } from "@/features/aors/services/aor.service";
import { branchRepository } from "@/features/branches/repositories/branch.repository";
import {
  assertPermittedBranch,
  isUnrestrictedBranchAccess,
} from "@/features/pixelcare-ai/tools/branch-access";
import type { AppSession } from "@/lib/auth/session";

const BRANCHES = [
  {
    id: "clbranchabp00000000000001",
    name: "ABENSON ABREEZA DAVAO",
    sapCode: "ABP001",
  },
  {
    id: "clbranchxyz00000000000002",
    name: "Other Store",
    sapCode: "XYZ999",
  },
];

function sessionWithPermissions(permissions: string[]): AppSession {
  return {
    user: {
      id: "user-1",
      tenantId: "tenant-1",
      permissions,
      roleSlugs: [],
      isPlatformOperator: false,
    },
  };
}

describe("isUnrestrictedBranchAccess", () => {
  it("is true for branches.manage, aors.manage, or master_data.manage", () => {
    expect(isUnrestrictedBranchAccess(["branches.manage"])).toBe(true);
    expect(isUnrestrictedBranchAccess(["aors.manage"])).toBe(true);
    expect(isUnrestrictedBranchAccess(["master_data.manage"])).toBe(true);
  });

  it("is false when none of the unrestricted permissions are present", () => {
    expect(isUnrestrictedBranchAccess([])).toBe(false);
    expect(isUnrestrictedBranchAccess(["inventory.view"])).toBe(false);
    expect(isUnrestrictedBranchAccess(undefined)).toBe(false);
  });
});

describe("assertPermittedBranch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("explains empty AOR when the user has no permitted stores", async () => {
    jest.mocked(aorService.getBranchIdsForUser).mockResolvedValue([]);
    jest.mocked(branchRepository.listByTenant).mockResolvedValue(BRANCHES as never);

    const result = await assertPermittedBranch(
      sessionWithPermissions(["inventory.view"]),
      "ABP001",
    );

    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("no stores in your area of responsibility"),
    });
  });

  it("explains not-found among permitted stores without claiming outside AOR", async () => {
    jest
      .mocked(aorService.getBranchIdsForUser)
      .mockResolvedValue(["clbranchabp00000000000001"]);
    jest.mocked(branchRepository.listByTenant).mockResolvedValue(BRANCHES as never);

    const result = await assertPermittedBranch(
      sessionWithPermissions(["inventory.view"]),
      "NOPE001",
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("not found among your permitted stores");
    expect(result.error).not.toMatch(/outside your area/i);
  });

  it("allows master_data.manage users to resolve any tenant branch", async () => {
    jest.mocked(branchRepository.listByTenant).mockResolvedValue(BRANCHES as never);

    const result = await assertPermittedBranch(
      sessionWithPermissions(["master_data.manage"]),
      "ABP001",
    );

    expect(result).toEqual({
      ok: true,
      branch: BRANCHES[0],
    });
    expect(aorService.getBranchIdsForUser).not.toHaveBeenCalled();
  });
});
