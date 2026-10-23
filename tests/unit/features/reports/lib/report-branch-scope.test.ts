jest.mock("@/lib/auth/permissions", () => ({
  hasPermission: (permissions: string[] | undefined, permission: string) => permissions?.includes(permission) ?? false,
}));
jest.mock("@/lib/aor/scope", () => ({ getUserBranchIds: jest.fn() }));

import { narrowBranchScope, resolveReportBranchScope } from "@/features/reports/lib/report-branch-scope";
import { getUserBranchIds } from "@/lib/aor/scope";

const aor = getUserBranchIds as jest.Mock;
const viewer = (permissions: string[]) => ({ tenantId: "t1", userId: "u1", permissions });

describe("resolveReportBranchScope", () => {
  it("gives branch managers every branch, ignoring their AOR", async () => {
    aor.mockResolvedValue(["b1"]);
    await expect(resolveReportBranchScope(viewer(["reports.view", "branches.manage"]), "NO_BRANCHES")).resolves.toBeUndefined();
    expect(aor).not.toHaveBeenCalled();
  });

  it("gives order approvers every branch", async () => {
    await expect(resolveReportBranchScope(viewer(["orders.approve"]), "NO_BRANCHES")).resolves.toBeUndefined();
  });

  it("limits everyone else to their AOR branches", async () => {
    aor.mockResolvedValue(["b1", "b2"]);
    await expect(resolveReportBranchScope(viewer(["reports.view"]), "NO_BRANCHES")).resolves.toEqual(["b1", "b2"]);
  });

  it("applies the report's fallback when the viewer has no branch AOR", async () => {
    aor.mockResolvedValue(null);
    await expect(resolveReportBranchScope(viewer(["reports.view"]), "NO_BRANCHES")).resolves.toEqual([]);
    await expect(resolveReportBranchScope(viewer(["inventory.view"]), "ALL_BRANCHES")).resolves.toBeUndefined();
  });

  it("treats AOR rows without branches (warehouse-only) as no branch AOR", async () => {
    aor.mockResolvedValue([]);
    await expect(resolveReportBranchScope(viewer(["reports.view"]), "NO_BRANCHES")).resolves.toEqual([]);
  });
});

describe("narrowBranchScope", () => {
  it("keeps the scope when no branch is requested", () => {
    expect(narrowBranchScope(["b1"], undefined)).toEqual(["b1"]);
    expect(narrowBranchScope(undefined, undefined)).toBeUndefined();
  });

  it("narrows to a requested branch inside the scope, or any branch when unrestricted", () => {
    expect(narrowBranchScope(["b1", "b2"], "b2")).toEqual(["b2"]);
    expect(narrowBranchScope(undefined, "b9")).toEqual(["b9"]);
  });

  it("rejects a branch outside the scope", () => {
    expect(narrowBranchScope(["b1"], "b2")).toBeNull();
    expect(narrowBranchScope([], "b1")).toBeNull();
  });
});
