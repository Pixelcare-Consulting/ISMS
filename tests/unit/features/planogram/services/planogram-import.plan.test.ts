const mockPlanogramUpsert = jest.fn();

jest.mock("@/lib/database/client", () => ({
  prisma: {
    branch: {
      findMany: jest.fn(async () => [
        { id: "b1", name: "Makati", sapCode: "MKT", status: "active" },
      ]),
    },
    productModel: {
      findMany: jest.fn(async () => [
        { id: "m1", skuCode: "OLD-1", status: "active" },
        { id: "m2", skuCode: "NEW-1", status: "active" },
      ]),
    },
    branchPlanogram: {
      findMany: jest.fn(async () => [{ id: "entry-1", branchId: "b1", modelId: "m1" }]),
      upsert: (args: unknown) => mockPlanogramUpsert(args),
    },
    branchAllowedModel: {
      findMany: jest.fn(async () => [{ branchId: "b1", modelId: "m1" }]),
      upsert: jest.fn(async () => ({})),
    },
    branchMilSetting: { upsert: jest.fn(async () => ({})) },
  },
}));

jest.mock("@/lib/auth/permissions", () => ({ hasPermission: jest.fn().mockReturnValue(true) }));
jest.mock("@/lib/aor/scope", () => ({ getUserBranchIds: jest.fn() }));
jest.mock("@/features/audit/services/audit.service", () => ({
  auditService: { log: jest.fn(), logMany: jest.fn() },
}));

import { planogramImportService } from "@/features/planogram/services/planogram-import.service";

const actor = { tenantId: "t1", userId: "u1", permissions: [] };

describe("planogram import without Max Qty", () => {
  beforeEach(() => mockPlanogramUpsert.mockReset().mockResolvedValue({ id: "entry-new" }));

  it("leaves an existing row alone even when an older file still has shelf_max", async () => {
    const { preview } = await planogramImportService.buildPlan(
      actor,
      Buffer.from("branch_name,sku,shelf_max\nMakati,OLD-1,99\n"),
    );

    expect(preview.errors).toEqual([]);
    expect(preview.rows[0]).toMatchObject({ sku: "OLD-1", action: "skip", changes: [] });
    expect(preview.canApply).toBe(false);
  });

  it("creates a new row without writing Max Qty, so the forecast upload still sets it", async () => {
    const result = await planogramImportService.apply({
      actor,
      file: Buffer.from("branch_name,sku\nMakati,NEW-1\n"),
    });

    expect(result).toMatchObject({ created: 1, updated: 0, allowedModelsAdded: 1 });
    expect(mockPlanogramUpsert).toHaveBeenCalledTimes(1);
    expect(mockPlanogramUpsert.mock.calls[0]?.[0]).toMatchObject({
      create: { tenantId: "t1", branchId: "b1", modelId: "m2" },
      update: {},
    });
    const { create } = mockPlanogramUpsert.mock.calls[0]?.[0] as { create: Record<string, unknown> };
    expect(create).not.toHaveProperty("maxQty");
    expect(create).not.toHaveProperty("maxQtyEditedAt");
  });
});
