jest.mock("@/lib/database/client", () => ({
  prisma: {
    branchPlanogram: { findMany: jest.fn(), update: jest.fn() },
    skuForecastTarget: { findMany: jest.fn() },
    demandPlanningLine: { findMany: jest.fn() },
    branch: { findMany: jest.fn() },
  },
}));

jest.mock("@/features/audit/services/audit.service", () => ({
  auditService: { logMany: jest.fn() },
}));

import { auditService } from "@/features/audit/services/audit.service";
import { planogramForecastRefreshService } from "@/features/planogram/services/planogram-forecast-refresh.service";
import { prisma } from "@/lib/database/client";

const db = prisma as unknown as {
  branchPlanogram: { findMany: jest.Mock; update: jest.Mock };
  skuForecastTarget: { findMany: jest.Mock };
  demandPlanningLine: { findMany: jest.Mock };
  branch: { findMany: jest.Mock };
};

const INPUT = {
  tenantId: "t1",
  actorUserId: "u1",
  periodId: "period-1",
  periodLabel: "Nov-26",
  branchIds: ["b1"],
};

function planogramRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    branchId: "b1",
    modelId: "m1",
    maxQty: 3,
    maxQtyEditedAt: null,
    maxQtyCalc: null,
    model: { skuCode: "32STW101" },
    branch: { name: "Makati" },
    ...overrides,
  };
}

beforeEach(() => {
  db.branchPlanogram.findMany.mockResolvedValue([planogramRow()]);
  db.branchPlanogram.update.mockResolvedValue({});
  db.skuForecastTarget.findMany.mockResolvedValue([{ branchId: "b1", modelId: "m1", qty: 20 }]);
  db.demandPlanningLine.findMany.mockResolvedValue([]);
  db.branch.findMany.mockResolvedValue([
    {
      id: "b1",
      deliveryScheduleConfig: { frequencyCode: { frequency: "weekly" } },
    },
  ]);
});

describe("planogramForecastRefreshService.refreshForBranches", () => {
  it("does nothing when the upload names no branches", async () => {
    const summary = await planogramForecastRefreshService.refreshForBranches({
      ...INPUT,
      branchIds: [],
    });

    expect(summary.rowCount).toBe(0);
    expect(db.branchPlanogram.findMany).not.toHaveBeenCalled();
  });

  it("writes the computed value and clears the manual edit flag", async () => {
    await planogramForecastRefreshService.refreshForBranches(INPUT);

    expect(db.branchPlanogram.update).toHaveBeenCalledWith({
      where: { id: "p1", tenantId: "t1" },
      data: expect.objectContaining({ maxQty: 5, maxQtyEditedAt: null }),
    });
  });

  it("reads DU from the newest run that is not superseded", async () => {
    db.demandPlanningLine.findMany.mockResolvedValue([
      { modelId: "m1", displayUnits: 4, runBranch: { branchId: "b1" } },
      { modelId: "m1", displayUnits: 9, runBranch: { branchId: "b1" } },
    ]);

    await planogramForecastRefreshService.refreshForBranches(INPUT);

    expect(db.demandPlanningLine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "t1",
          run: { status: { not: "superseded" } },
        }),
        orderBy: { run: { createdAt: "desc" } },
      }),
    );
    expect(db.branchPlanogram.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ maxQty: 6 }) }),
    );
  });

  it("audits a changed value with its previous value and source", async () => {
    await planogramForecastRefreshService.refreshForBranches(INPUT);

    expect(auditService.logMany).toHaveBeenCalledWith([
      expect.objectContaining({
        action: "planogram.max_qty_updated",
        entityType: "BranchPlanogram",
        entityId: "p1",
        metadata: expect.objectContaining({
          maxQty: 5,
          previousMaxQty: 3,
          source: "forecast-import",
        }),
      }),
    ]);
  });

  it("does not write or audit a row that already matches", async () => {
    db.branchPlanogram.findMany.mockResolvedValue([
      planogramRow({
        maxQty: 5,
        maxQtyCalc: {
          forecastQty: 20,
          displayUnits: 0,
          dropsPerMonth: 4,
          frequencyMissing: false,
          periodLabel: "Nov-26",
          computedAt: "2026-11-01T00:00:00.000Z",
          overriddenManualQty: null,
        },
      }),
    ]);

    await planogramForecastRefreshService.refreshForBranches(INPUT);

    expect(db.branchPlanogram.update).not.toHaveBeenCalled();
    expect(auditService.logMany).not.toHaveBeenCalled();
  });
});
