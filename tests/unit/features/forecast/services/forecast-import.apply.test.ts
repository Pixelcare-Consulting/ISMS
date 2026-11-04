jest.mock("@/lib/database/client", () => ({
  prisma: {
    planningPeriod: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      upsert: jest.fn().mockResolvedValue({ id: "period-1" }),
    },
    skuForecastTarget: { upsert: jest.fn().mockResolvedValue({ id: "target-1" }) },
  },
}));

jest.mock("@/lib/auth/permissions", () => ({ hasPermission: jest.fn() }));
jest.mock("@/lib/aor/scope", () => ({ getUserBranchIds: jest.fn() }));

jest.mock("@/features/audit/services/audit.service", () => ({
  auditService: { log: jest.fn(), logMany: jest.fn() },
}));

jest.mock("@/features/planogram/services/planogram-forecast-refresh.service", () => ({
  planogramForecastRefreshService: { refreshForBranches: jest.fn() },
}));

import { forecastImportService } from "@/features/forecast/services/forecast-import.service";
import { planogramForecastRefreshService } from "@/features/planogram/services/planogram-forecast-refresh.service";
import { setCachedPlan } from "@/lib/shared/import-plan-cache";

const refresh = planogramForecastRefreshService.refreshForBranches as jest.Mock;

const SUMMARY = {
  rowCount: 1,
  changedCount: 1,
  zeroForecastCount: 0,
  zeroDuCount: 1,
  missingFrequencyCount: 0,
  overriddenCount: 0,
  overriddenRows: [],
};

const ACTOR = { tenantId: "t1", userId: "u1", permissions: [] };

function sfeWrite() {
  return {
    kind: "sfe",
    period: "Nov-26",
    sapCode: "B1",
    branchName: "Makati",
    sku: "32STW101",
    forecastQty: 20,
    action: "create",
    changes: [],
    branchId: "b1",
    modelId: "m1",
  };
}

function cachedPlan(key: string, writes: unknown[]) {
  setCachedPlan(key, {
    preview: { errors: [], unchangedCount: 0, sfeUnchangedCount: 3, rowCount: 0, sfeRowCount: 3 },
    periodLabel: "Nov-26",
    writes,
    branchIds: ["b1", "b2"],
  });
}

beforeEach(() => {
  refresh.mockResolvedValue(SUMMARY);
});

describe("forecastImportService.applyChunk planogram refresh", () => {
  it("refreshes every branch in the file after the last chunk", async () => {
    cachedPlan("plan-writes", [sfeWrite()]);

    const progress = await forecastImportService.applyChunk({
      actor: ACTOR,
      planKey: "plan-writes",
      offset: 0,
    });

    expect(refresh).toHaveBeenCalledWith({
      tenantId: "t1",
      actorUserId: "u1",
      periodId: "period-1",
      periodLabel: "Nov-26",
      branchIds: ["b1", "b2"],
    });
    expect(progress.result?.planogram).toEqual(SUMMARY);
  });

  it("still refreshes when every row in the file is unchanged", async () => {
    cachedPlan("plan-unchanged", []);

    const progress = await forecastImportService.applyChunk({
      actor: ACTOR,
      planKey: "plan-unchanged",
      offset: 0,
    });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(progress.result?.planogram).toEqual(SUMMARY);
  });

  it("does not refresh before the last chunk", async () => {
    const writes = Array.from({ length: 251 }, () => sfeWrite());
    cachedPlan("plan-chunks", writes);

    const progress = await forecastImportService.applyChunk({
      actor: ACTOR,
      planKey: "plan-chunks",
      offset: 0,
    });

    expect(progress.done).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });
});
