jest.mock("@/lib/database/client", () => ({
  prisma: {
    productModel: { findMany: jest.fn() },
    series: { findMany: jest.fn() },
    brand: { findMany: jest.fn() },
    category: { findMany: jest.fn() },
    feature: { findMany: jest.fn() },
    resolution: { findMany: jest.fn() },
    actualSize: { findMany: jest.fn() },
  },
}));
jest.mock("@/features/audit/services/audit.service", () => ({
  auditService: { log: jest.fn(), logMany: jest.fn() },
}));
jest.mock("@/features/master-data/services/model-brand-sap-push.service", () => ({
  modelBrandSapPushService: { pushAndAudit: jest.fn() },
}));
jest.mock("@/features/master-data/repositories/master-data.repository", () => ({
  masterDataRepository: {
    findModel: jest.fn(),
    findSeries: jest.fn(),
    updateModelDetails: jest.fn(),
  },
}));
// Every test builds its own plan; a cached plan from an earlier file must not leak in.
jest.mock("@/lib/shared/import-plan-cache", () => ({
  getCachedPlan: jest.fn(() => undefined),
  setCachedPlan: jest.fn(),
  invalidatePlan: jest.fn(),
  planKeyFor: jest.fn(() => "plan-key"),
}));

import { masterDataRepository } from "@/features/master-data/repositories/master-data.repository";
import { masterDataService } from "@/features/master-data/services/master-data.service";
import { modelBrandSapPushService } from "@/features/master-data/services/model-brand-sap-push.service";
import { modelImportService } from "@/features/master-data/services/model-import.service";
import { prisma } from "@/lib/database/client";

const db = prisma as unknown as Record<string, { findMany: jest.Mock }>;
const repo = masterDataRepository as jest.Mocked<typeof masterDataRepository>;
const push = modelBrandSapPushService.pushAndAudit as jest.Mock;

const existingModel = {
  id: "m1",
  skuCode: "55A6K",
  name: "HISENSE 55 A6K",
  status: "active" as const,
  brandId: "b-hisense",
  seriesId: "s-a6",
  categoryId: null,
  featureId: "f-old",
  resolutionId: null,
  actualSizeId: null,
  brand: { name: "HISENSE" },
  series: { name: "A6" },
  category: null,
  feature: { name: "Old feature" },
  resolution: null,
  actualSize: null,
};

function seedLookups() {
  db.productModel.findMany.mockResolvedValue([existingModel]);
  db.series.findMany.mockResolvedValue([
    { id: "s-a6", name: "A6", code: null, recordStatus: "active" },
  ]);
  db.brand.findMany.mockResolvedValue([
    { id: "b-hisense", name: "HISENSE", code: "HISE" },
    { id: "b-tcl", name: "TCL", code: null },
  ]);
  db.category.findMany.mockResolvedValue([
    { id: "c-tv", name: "Television", code: "TV", recordStatus: "active" },
    { id: "c-old", name: "Legacy", code: null, recordStatus: "inactive" },
  ]);
  db.feature.findMany.mockResolvedValue([
    { id: "f-old", name: "Old feature", recordStatus: "inactive" },
    { id: "f-smart", name: "Smart", recordStatus: "active" },
  ]);
  db.resolution.findMany.mockResolvedValue([{ id: "r-4k", name: "4K", recordStatus: "active" }]);
  db.actualSize.findMany.mockResolvedValue([{ id: "a-55", name: "55\"", recordStatus: "active" }]);
}

const HEADER = "sku,name,brand,series,category,feature,resolution,actual_size,status";

function csv(...rows: string[]): Buffer {
  return Buffer.from([HEADER, ...rows].join("\n"), "utf8");
}

async function preview(...rows: string[]) {
  const { preview } = await modelImportService.buildPlan("t1", csv(...rows));
  return preview;
}

beforeEach(() => {
  jest.clearAllMocks();
  seedLookups();
});

describe("model import foreign keys", () => {
  it("rejects a brand ISMS does not have instead of creating it", async () => {
    const result = await preview("55A6K,HISENSE 55 A6K,SONY,A6,,,,,");
    expect(result.canApply).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toBe(
      'Brand "SONY" is not available in ISMS. Add it in Master data first.',
    );
    expect(result.sapBrandRowCount).toBe(0);
  });

  it.each([
    ["category", "55A6K,HISENSE 55 A6K,HISENSE,A6,Monitor,,,,", 'Category "Monitor"'],
    ["feature", "55A6K,HISENSE 55 A6K,HISENSE,A6,,Gaming,,,", 'Feature "Gaming"'],
    ["resolution", "55A6K,HISENSE 55 A6K,HISENSE,A6,,,8K,,", 'Resolution "8K"'],
    ["actual size", "55A6K,HISENSE 55 A6K,HISENSE,A6,,,,99,", 'Actual size "99"'],
  ])("rejects an unknown %s", async (_field, row, prefix) => {
    const result = await preview(row);
    expect(result.canApply).toBe(false);
    expect(result.errors.map((e) => e.message)).toEqual([
      `${prefix} is not available in ISMS. Add it in Master data first.`,
    ]);
  });

  it("reports every missing lookup on the same row", async () => {
    const result = await preview("55A6K,HISENSE 55 A6K,SONY,A6,Monitor,Gaming,8K,99,");
    expect(result.errors).toHaveLength(5);
  });

  it("matches by code, id, and casing, and treats the same id as unchanged", async () => {
    const result = await preview("55A6K,HISENSE 55 A6K,hise,a6,,f-old,,,");
    expect(result.errors).toEqual([]);
    expect(result.unchangedCount).toBe(1);
    expect(result.updateCount).toBe(0);
  });

  it("refuses a newly chosen inactive value but keeps one the model already has", async () => {
    const inactiveNew = await preview("55A6K,HISENSE 55 A6K,HISENSE,A6,Legacy,,,,");
    expect(inactiveNew.errors[0].message).toMatch(/^Category "Legacy" is inactive/);

    const inactiveKept = await preview("55A6K,HISENSE 55 A6K,HISENSE,A6,,Old feature,,,");
    expect(inactiveKept.errors).toEqual([]);
  });

  it("plans an update with the ISMS spelling of every changed lookup", async () => {
    const result = await preview("55A6K,HISENSE 55 A6K,tcl,A6,tv,smart,4k,\"55\"\"\",");
    expect(result.errors).toEqual([]);
    expect(result.canApply).toBe(true);
    expect(result.rows[0].changes).toEqual([
      { field: "brand", label: "Brand", from: "HISENSE", to: "TCL" },
      { field: "category", label: "Category", from: "—", to: "Television" },
      { field: "feature", label: "Feature", from: "Old feature", to: "Smart" },
      { field: "resolution", label: "Resolution", from: "—", to: "4K" },
      { field: "actualSize", label: "Actual size", from: "—", to: '55"' },
    ]);
  });
});

describe("masterDataService.updateModelDetails", () => {
  const base = {
    tenantId: "t1",
    actorUserId: "u1",
    modelId: "m1",
    brandId: "b-hisense",
    seriesId: "s-a6",
    categoryId: null,
    featureId: "f-old",
    resolutionId: null,
    actualSizeId: null,
  };

  beforeEach(() => {
    repo.findModel.mockResolvedValue(existingModel as never);
    repo.updateModelDetails.mockResolvedValue({ id: "m1", skuCode: "55A6K" } as never);
    push.mockResolvedValue({ updated: 1, matched: 0, missing: 0, failed: 0, failures: [] });
  });

  it("rejects a brand id that is not in ISMS", async () => {
    await expect(
      masterDataService.updateModelDetails({ ...base, brandId: "b-gone" }),
    ).rejects.toThrow('Brand "b-gone" is not available in ISMS.');
    expect(repo.updateModelDetails).not.toHaveBeenCalled();
  });

  it.each([
    ["categoryId", "c-gone", "Category"],
    ["featureId", "f-gone", "Feature"],
    ["resolutionId", "r-gone", "Resolution"],
    ["actualSizeId", "a-gone", "Actual size"],
  ])("rejects a %s that is not in ISMS", async (key, id, label) => {
    await expect(
      masterDataService.updateModelDetails({ ...base, [key]: id }),
    ).rejects.toThrow(`${label} "${id}" is not available in ISMS.`);
    expect(repo.updateModelDetails).not.toHaveBeenCalled();
  });

  it("rejects a newly chosen inactive category", async () => {
    await expect(
      masterDataService.updateModelDetails({ ...base, categoryId: "c-old" }),
    ).rejects.toThrow(/inactive/);
  });

  it("rejects a save with nothing changed", async () => {
    await expect(masterDataService.updateModelDetails(base)).rejects.toThrow("Nothing changed");
  });

  it("saves without touching SAP when the brand is unchanged", async () => {
    const result = await masterDataService.updateModelDetails({ ...base, categoryId: "c-tv" });
    expect(result).toEqual({});
    expect(push).not.toHaveBeenCalled();
  });

  it("pushes a brand change to SAP and warns when SAP refuses", async () => {
    push.mockResolvedValue({
      updated: 0,
      matched: 0,
      missing: 0,
      failed: 0,
      failures: [],
      aborted: "No SAP connection",
    });
    const result = await masterDataService.updateModelDetails({ ...base, brandId: "b-tcl" });
    expect(push).toHaveBeenCalledWith(
      expect.objectContaining({ rows: [{ sku: "55A6K", brand: "TCL" }], source: "model-edit" }),
    );
    expect(result.sapWarning).toMatch(/No SAP connection/);
  });
});
