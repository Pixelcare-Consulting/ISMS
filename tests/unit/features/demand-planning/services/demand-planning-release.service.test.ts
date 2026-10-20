jest.mock("@/lib/database/client", () => ({
  prisma: {
    $transaction: jest.fn(),
    branchOrder: { create: jest.fn() },
  },
}));

jest.mock("@/features/audit/services/audit.service", () => ({
  auditService: { log: jest.fn(async () => undefined) },
}));

jest.mock("@/features/demand-planning/repositories/demand-planning.repository", () => ({
  demandPlanningRepository: {
    findRunById: jest.fn(),
    listLinesForRun: jest.fn(),
    findExistingOpenAutoReplenish: jest.fn(),
  },
}));

import { auditService } from "@/features/audit/services/audit.service";
import { demandPlanningRepository } from "@/features/demand-planning/repositories/demand-planning.repository";
import { demandPlanningReleaseService } from "@/features/demand-planning/services/demand-planning-release.service";
import { prisma } from "@/lib/database/client";

const findRunById = demandPlanningRepository.findRunById as jest.Mock;
const listLinesForRun = demandPlanningRepository.listLinesForRun as jest.Mock;
const findExistingOpenAutoReplenish =
  demandPlanningRepository.findExistingOpenAutoReplenish as jest.Mock;
const auditLog = auditService.log as jest.Mock;
const branchOrderCreate = prisma.branchOrder.create as jest.Mock;

function generatedRun() {
  return {
    id: "run-1",
    status: "generated",
    documentNumber: "DP-001",
    supersedesRunId: "run-0",
    period: { label: "Oct-26" },
    branches: [
      {
        id: "rb-1",
        branchId: "branch-1",
        planStatus: "planned",
        branch: { sapCode: "ABP", name: "Store" },
      },
      {
        id: "rb-2",
        branchId: "branch-2",
        planStatus: "no_history",
        branch: { sapCode: "XYZ", name: "Other" },
      },
    ],
  };
}

describe("demand planning release", () => {
  const lineUpdate = jest.fn(async () => ({}));
  const runUpdate = jest.fn(async () => ({}));
  const runUpdateMany = jest.fn(async () => ({ count: 1 }));

  beforeEach(() => {
    jest.clearAllMocks();
    findExistingOpenAutoReplenish.mockResolvedValue({
      id: "order-open",
      orderNumber: "SO#2026-10-00009",
      status: "pending_tl",
    });
    findRunById.mockResolvedValue(generatedRun());
    listLinesForRun.mockResolvedValue([
      { id: "line-1", runBranchId: "rb-1", modelId: "m1", computedDrop1Qty: 4.8 },
      { id: "line-2", runBranchId: "rb-2", modelId: "m2", computedDrop1Qty: 0 },
    ]);
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => {
        await fn({
          demandPlanningLine: { update: lineUpdate },
          demandPlanningRun: { update: runUpdate, updateMany: runUpdateMany },
        });
      },
    );
  });

  it("freezes Drop 1, releases the run, and creates no order", async () => {
    const result = await demandPlanningReleaseService.releaseRun("tenant-1", "user-1", "run-1");

    expect(lineUpdate).toHaveBeenCalledWith({
      where: { id: "line-1" },
      data: { releasedDrop1Qty: 4 },
    });
    expect(lineUpdate).toHaveBeenCalledWith({
      where: { id: "line-2" },
      data: { releasedDrop1Qty: 0 },
    });
    expect(runUpdate).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: { status: "released", releasedAt: expect.any(Date) },
    });
    expect(runUpdateMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", id: "run-0", status: "released" },
      data: { status: "superseded" },
    });
    expect(branchOrderCreate).not.toHaveBeenCalled();
    expect(findExistingOpenAutoReplenish).not.toHaveBeenCalled();
    expect(result.orders).toEqual([]);
    expect(result.skipped).toEqual([
      { branchName: "XYZ Other", reason: "no Drop 1 quantity" },
    ]);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "demand_planning.run_released",
        entityId: "run-1",
        metadata: expect.objectContaining({ orderCount: 0, skippedCount: 1 }),
      }),
    );
  });

  it("previews branches without implying an order will be created", async () => {
    const preview = await demandPlanningReleaseService.previewRelease("tenant-1", "run-1");

    expect(preview.willRelease).toEqual([{ branchName: "ABP Store" }]);
    expect(preview.noDrop1).toEqual([{ branchName: "XYZ Other" }]);
    expect(preview.openOrder).toEqual([]);
    expect(findExistingOpenAutoReplenish).not.toHaveBeenCalled();
    expect(branchOrderCreate).not.toHaveBeenCalled();
  });
});
