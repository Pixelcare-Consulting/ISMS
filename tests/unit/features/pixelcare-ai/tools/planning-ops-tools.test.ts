jest.mock("ai", () => ({
  tool: <T,>(def: T) => def,
}));

jest.mock("@/lib/auth/permissions", () => ({
  hasPermission: (permissions: string[] | undefined, permission: string) =>
    permissions?.includes(permission) ?? false,
}));

jest.mock("@/features/pixelcare-ai/tools/branch-access", () => ({
  isUnrestrictedBranchAccess: (permissions: string[] | undefined) =>
    permissions?.includes("branches.manage") ?? false,
  listPermittedBranches: jest.fn(async () => [
    {
      id: "clbranchabp00000000000001",
      name: "ABENSON ABREEZA DAVAO",
      sapCode: "ABP001",
    },
  ]),
}));

jest.mock("@/features/branch-quotas/services/branch-quota.service", () => ({
  branchQuotaService: {
    list: jest.fn(async () => [
      {
        id: "quota-1",
        branchId: "clbranchabp00000000000001",
        quotaDate: new Date(Date.UTC(2026, 9, 1)),
        quotaAmount: 50,
        branch: {
          id: "clbranchabp00000000000001",
          name: "ABENSON ABREEZA DAVAO",
          sapCode: "ABP001",
        },
        brand: { id: "brand-1", name: "DEVANT" },
      },
      {
        id: "quota-2",
        branchId: "clbranchxyz00000000000002",
        quotaDate: new Date(Date.UTC(2026, 9, 1)),
        quotaAmount: 99,
        branch: {
          id: "clbranchxyz00000000000002",
          name: "Other Store",
          sapCode: "XYZ999",
        },
        brand: { id: "brand-1", name: "DEVANT" },
      },
    ]),
  },
}));

jest.mock("@/features/demand-planning/services/demand-planning-run.service", () => ({
  demandPlanningRunService: {
    listRuns: jest.fn(async () => ({
      items: [
        {
          id: "run-1",
          documentNumber: "DP-1",
          version: 1,
          status: "generated",
          name: "Oct",
          periodLabel: "2026-10",
          branchCount: 2,
          plannedBranchCount: 2,
          createdAt: "2026-10-01T00:00:00.000Z",
          releasedAt: null,
        },
      ],
      total: 1,
    })),
    getRun: jest.fn(),
  },
}));

jest.mock("@/features/demand-planning/services/coverage.service", () => ({
  DEMAND_PLANNING_COVERAGE_PERMISSIONS: [
    "forecast.view",
    "forecast.manage",
    "reports.view",
  ],
  coverageService: { getCoverageMonitor: jest.fn() },
}));

jest.mock("@/features/forecast/repositories/forecast.repository", () => ({
  forecastRepository: {
    findActivePeriod: jest.fn(),
    findPeriodById: jest.fn(),
    listAllocationsForPeriodPaginated: jest.fn(),
  },
}));

jest.mock("@/features/forecast/services/suggested-order.service", () => ({
  suggestedOrderService: {
    listDraftSuggestedOrdersPaginated: jest.fn(),
  },
}));

jest.mock("@/features/dashboard/services/dashboard-kpi.service", () => ({
  getDashboardKpis: jest.fn(),
  getDashboardAnalytics: jest.fn(),
}));

jest.mock("@/features/dashboard/services/dashboard-sales.service", () => ({
  getDashboardSalesAnalytics: jest.fn(),
}));

jest.mock("@/features/planogram/services/planogram.service", () => ({
  planogramService: {
    getMilAndCapacityAlertDetails: jest.fn(),
  },
}));

jest.mock("@/features/logistics/repositories/logistics.repository", () => ({
  logisticsRepository: {
    countDeliveriesByStatus: jest.fn(),
    countAllDeliveries: jest.fn(),
    countTransfersByStatus: jest.fn(),
    countAllTransfers: jest.fn(),
    countPulloutsByStatus: jest.fn(),
    countAllPullouts: jest.fn(),
  },
}));

jest.mock("@/features/reason-status/services/reason-status.service", () => ({
  reasonStatusService: { listActiveCodes: jest.fn(async () => []) },
}));

jest.mock("@/lib/aor/scope", () => ({
  getUserBranchIds: jest.fn(async () => ["clbranchabp00000000000001"]),
}));

jest.mock("@/lib/database/client", () => ({
  prisma: {
    branchReturnRequest: { findMany: jest.fn() },
  },
}));

import type { ToolExecutionOptions } from "ai";
import { branchQuotaService } from "@/features/branch-quotas/services/branch-quota.service";
import { demandPlanningRunService } from "@/features/demand-planning/services/demand-planning-run.service";
import { buildPlanningOpsTools } from "@/features/pixelcare-ai/tools/planning-ops-tools";
import type { AppSession } from "@/lib/auth/session";
import { prisma } from "@/lib/database/client";

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

/** Minimal ToolExecutionOptions stub for direct execute() unit tests. */
function toolOpts(
  toolCallId: string,
): ToolExecutionOptions<Record<string, unknown>> {
  return { toolCallId, messages: [], context: {} };
}

describe("planning-ops tools gates", () => {
  const prevSample = process.env.PIXELCARE_AI_SAMPLE_MODE;

  beforeEach(() => {
    process.env.PIXELCARE_AI_SAMPLE_MODE = "false";
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env.PIXELCARE_AI_SAMPLE_MODE = prevSample;
  });

  it("denies listDemandPlanningRuns without forecast.view", async () => {
    const tools = buildPlanningOpsTools(sessionWithPermissions([]));
    const result = await tools.listDemandPlanningRuns.execute!(
      {},
      toolOpts("t1"),
    );
    expect(result).toEqual(
      expect.objectContaining({
        error: expect.stringContaining("outside your access"),
      }),
    );
    expect(demandPlanningRunService.listRuns).not.toHaveBeenCalled();
  });

  it("returns planning run list shape when forecast.view is granted", async () => {
    const tools = buildPlanningOpsTools(
      sessionWithPermissions(["forecast.view"]),
    );
    const result = (await tools.listDemandPlanningRuns.execute!(
      {},
      toolOpts("t2"),
    )) as Record<string, unknown>;

    expect(result.sample).toBe(false);
    expect(result.sourceHref).toBe("/settings/planning/runs");
    expect(result.runs).toEqual([
      expect.objectContaining({
        id: "run-1",
        documentNumber: "DP-1",
        periodLabel: "2026-10",
      }),
    ]);
    expect(demandPlanningRunService.listRuns).toHaveBeenCalled();
  });

  it("filters branch quotas to AOR for non-admin inventory viewers", async () => {
    const tools = buildPlanningOpsTools(
      sessionWithPermissions(["inventory.view"]),
    );
    const result = (await tools.listBranchQuotas.execute!(
      {},
      toolOpts("t3"),
    )) as { quotas: Array<{ branchId: string }> };

    expect(branchQuotaService.list).toHaveBeenCalled();
    expect(result.quotas).toHaveLength(1);
    expect(result.quotas[0]?.branchId).toBe("clbranchabp00000000000001");
  });

  it("drops demand-planning branches outside the user area", async () => {
    (demandPlanningRunService.getRun as jest.Mock).mockResolvedValue({
      id: "run-1",
      documentNumber: "DP-1",
      version: 1,
      status: "generated",
      name: "Oct",
      periodId: "period-1",
      periodLabel: "2026-10",
      createdAt: "2026-10-01T00:00:00.000Z",
      releasedAt: null,
      branchCount: 2,
      branches: [
        {
          id: "row-1",
          branchId: "clbranchabp00000000000001",
          sapCode: "ABP001",
          name: "ABENSON",
          planStatus: "planned",
        },
        {
          id: "row-2",
          branchId: "clbranchxyz00000000000002",
          sapCode: "XYZ999",
          name: "Other Store",
          planStatus: "planned",
        },
      ],
    });
    const tools = buildPlanningOpsTools(sessionWithPermissions(["forecast.view"]));
    const result = (await tools.getDemandPlanningRun.execute!(
      { runId: "run-1" },
      toolOpts("t-run"),
    )) as { branches: Array<{ branchId: string }> };

    expect(result.branches).toEqual([
      expect.objectContaining({ branchId: "clbranchabp00000000000001" }),
    ]);
    expect(JSON.stringify(result)).not.toContain("XYZ999");
  });

  it("does not select customerName for return lookups", async () => {
    const findMany = prisma.branchReturnRequest.findMany as jest.Mock;
    findMany.mockResolvedValue([]);
    const tools = buildPlanningOpsTools(sessionWithPermissions(["returns.view"]));
    await tools.findReturnStatus.execute!({ query: "ATR-1" }, toolOpts("t-return"));
    const select = findMany.mock.calls[0]?.[0]?.select as { sale?: { select?: Record<string, unknown> } };
    expect(select?.sale?.select).not.toHaveProperty("customerName");
  });

  it("denies listAllocationGaps without forecast.manage / planogram.manage", async () => {
    const tools = buildPlanningOpsTools(
      sessionWithPermissions(["forecast.view"]),
    );
    const result = await tools.listAllocationGaps.execute!(
      {},
      toolOpts("t4"),
    );
    expect(result).toEqual(
      expect.objectContaining({
        error: expect.stringContaining("outside your access"),
      }),
    );
  });
});
