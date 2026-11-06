import {
  applyBranchQuotaImportAction,
  applyBranchQuotaImportChunkAction,
  downloadBranchQuotaImportTemplateAction,
  previewBranchQuotaImportAction,
} from "@/features/branch-quotas/actions/branch-quota-import.actions";
import {
  createBranchQuotaAction,
  deleteBranchQuotaAction,
  listBranchQuotaFormOptionsAction,
  listBranchQuotasAction,
  updateBranchQuotaAction,
} from "@/features/branch-quotas/actions/branch-quota.actions";
import { branchQuotaService } from "@/features/branch-quotas/services/branch-quota.service";

const FORBIDDEN = "FORBIDDEN";
let mockPermissions: string[] = [];

jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

// Keeps the real allow/deny decision so a wrong slug in an action fails the test.
jest.mock("@/lib/auth/permissions", () => {
  const session = () => ({
    user: { id: "user-1", tenantId: "tenant-1", permissions: mockPermissions },
  });
  return {
    requirePermission: jest.fn(async (slug: string) => {
      if (!mockPermissions.includes(slug)) throw new Error("FORBIDDEN");
      return session();
    }),
    requireAnyPermission: jest.fn(async (slugs: string[]) => {
      if (!slugs.some((slug) => mockPermissions.includes(slug))) {
        throw new Error("FORBIDDEN");
      }
      return session();
    }),
  };
});

jest.mock("@/features/branch-quotas/services/branch-quota.service", () => ({
  branchQuotaService: {
    list: jest.fn(async () => []),
    listFormOptions: jest.fn(async () => ({ branches: [], brands: [] })),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock("@/features/branch-quotas/services/branch-quota-import.service", () => ({
  branchQuotaImportService: {},
}));

const managerOnlyActions: Array<[string, () => Promise<unknown>]> = [
  ["form options", () => listBranchQuotaFormOptionsAction()],
  ["create", () => createBranchQuotaAction({})],
  ["update", () => updateBranchQuotaAction({})],
  ["delete", () => deleteBranchQuotaAction("quota-1")],
  ["import template", () => downloadBranchQuotaImportTemplateAction()],
  ["import preview", () => previewBranchQuotaImportAction(new FormData())],
  ["import chunk", () => applyBranchQuotaImportChunkAction(new FormData())],
  ["import apply", () => applyBranchQuotaImportAction(new FormData())],
];

describe("branch quota access", () => {
  it("lets a view-only user list quotas", async () => {
    mockPermissions = ["branch_quotas.view"];

    await expect(listBranchQuotasAction()).resolves.toEqual([]);
    expect(branchQuotaService.list).toHaveBeenCalledWith("tenant-1");
  });

  it("lets a manager without the view slug list quotas", async () => {
    mockPermissions = ["branch_quotas.manage"];

    await expect(listBranchQuotasAction()).resolves.toEqual([]);
  });

  it("refuses the list to users holding only branch permissions", async () => {
    mockPermissions = ["branches.view", "branches.manage"];

    await expect(listBranchQuotasAction()).rejects.toThrow(FORBIDDEN);
  });

  it.each(managerOnlyActions)("refuses %s to a view-only user", async (_name, run) => {
    mockPermissions = ["branch_quotas.view"];

    await expect(run()).rejects.toThrow(FORBIDDEN);
  });

  it.each(managerOnlyActions)(
    "refuses %s to users holding only branch permissions",
    async (_name, run) => {
      mockPermissions = ["branches.view", "branches.manage"];

      await expect(run()).rejects.toThrow(FORBIDDEN);
    },
  );

  it.each(managerOnlyActions)("does not refuse %s to a manager", async (_name, run) => {
    mockPermissions = ["branch_quotas.manage"];

    // Past the guard the empty input may fail for other reasons, only the guard matters here.
    const outcome = await run().catch((error: Error) => error.message);

    expect(outcome).not.toBe(FORBIDDEN);
  });
});
