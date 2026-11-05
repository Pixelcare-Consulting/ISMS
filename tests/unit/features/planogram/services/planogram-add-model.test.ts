const mockCreateEntry = jest.fn();
const mockUpsertMil = jest.fn();

jest.mock("@/features/planogram/repositories/planogram.repository", () => ({
  planogramRepository: {
    isModelAllowedForBranch: jest.fn(async () => true),
    findPlanogramEntry: jest.fn(async () => null),
    createEntry: (...args: unknown[]) => mockCreateEntry(...args),
    upsertMil: (...args: unknown[]) => mockUpsertMil(...args),
  },
}));
jest.mock("@/features/master-data/repositories/master-data.repository", () => ({
  masterDataRepository: { findModel: jest.fn(async () => ({ status: "active" })) },
}));
jest.mock("@/features/reason-status/repositories/reason-status.repository", () => ({
  reasonStatusRepository: {},
}));
jest.mock("@/features/audit/services/audit.service", () => ({
  auditService: { log: jest.fn() },
}));

import { planogramService } from "@/features/planogram/services/planogram.service";

describe("planogramService.addModels", () => {
  beforeEach(() => {
    mockCreateEntry.mockReset().mockResolvedValue({ id: "entry-1" });
    mockUpsertMil.mockReset();
  });

  it("adds a SKU without a Max Qty and still saves the default MIL days", async () => {
    const result = await planogramService.addModels({
      tenantId: "t1",
      actorUserId: "u1",
      branchId: "b1",
      modelIds: ["m1"],
    });

    expect(result).toEqual({ added: 1, errors: [] });
    expect(mockCreateEntry).toHaveBeenCalledWith("t1", { branchId: "b1", modelId: "m1" });
    expect(mockUpsertMil).toHaveBeenCalledWith("t1", {
      branchId: "b1",
      modelId: "m1",
      daysThreshold: 30,
    });
  });
});
