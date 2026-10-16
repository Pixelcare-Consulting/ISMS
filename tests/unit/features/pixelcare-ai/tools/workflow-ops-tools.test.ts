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
  assertPermittedBranch: jest.fn(async (_session, ref: string) => {
    if (ref === "missing") {
      return { ok: false as const, error: "That store was not found." };
    }
    return {
      ok: true as const,
      branch: {
        id: "clbranchabp00000000000001",
        name: "ABENSON ABREEZA DAVAO",
        sapCode: "ABP001",
      },
    };
  }),
  listPermittedBranches: jest.fn(async () => [
    {
      id: "clbranchabp00000000000001",
      name: "ABENSON ABREEZA DAVAO",
      sapCode: "ABP001",
    },
  ]),
}));

jest.mock("@/features/stock-audit/services/pcount-dashboard.service", () => ({
  pcountDashboardService: {
    getOverview: jest.fn(async () => ({
      period: { year: 2026, month: 10, label: "Oct 2026" },
      kpis: {
        branchesDone: 1,
        branchesActive: 1,
        countingOpen: 1,
        readyToPost: 0,
        pendingSap: 0,
      },
      groups: [],
      dealers: [],
    })),
    getBranchDetail: jest.fn(async () => ({
      branchId: "clbranchabp00000000000001",
      branchName: "ABENSON ABREEZA DAVAO",
      branchSapCode: "ABP001",
      lastCountByName: "Tester",
      lastClosedAt: null,
      currentCounting: "Counting (open)",
      currentPosting: "—",
      latestSessionId: "session-1",
      canPostDifferences: false,
      sessions: [
        {
          id: "session-1",
          sessionNo: "PC-1",
          status: "in_progress",
          counting: "Counting (open)",
          posting: "—",
          createdAt: new Date("2026-10-01T00:00:00.000Z"),
          closedAt: null,
          createdByName: "Tester",
          sapDocRef: null,
          isPostable: false,
        },
      ],
    })),
  },
}));

jest.mock("@/features/stock-audit/services/stock-audit.service", () => ({
  stockAuditService: {
    listForUser: jest.fn(async () => ({
      items: [
        {
          id: "session-1",
          sessionNo: "PC-1",
          status: "in_progress",
          createdAt: new Date("2026-10-01T00:00:00.000Z"),
          closedAt: null,
          branch: {
            id: "clbranchabp00000000000001",
            name: "ABENSON ABREEZA DAVAO",
            sapCode: "ABP001",
          },
        },
      ],
      total: 1,
    })),
  },
}));

jest.mock("@/features/monthly-sir/services/monthly-sir.service", () => ({
  monthlySirService: {
    list: jest.fn(async () => ({
      items: [
        {
          id: "sir-1",
          status: "pending",
          purpose: "October count",
          createdAt: new Date("2026-10-01T00:00:00.000Z"),
          branch: {
            id: "clbranchabp00000000000001",
            name: "ABENSON ABREEZA DAVAO",
            sapCode: "ABP001",
          },
          stockCountSession: null,
        },
      ],
      total: 1,
    })),
    getUploadAllowance: jest.fn(async () => ({
      role: "tl",
      unlimited: false,
      canDirectUpload: true,
      mustRequest: false,
      slotsRemainingToday: 1,
      slotsRemainingMonth: 1,
      slotsTotalMonth: 1,
      activeHalf: null,
      message: null,
    })),
  },
}));

jest.mock("@/features/ops/services/ops.service", () => ({
  opsService: {
    listDeliveries: jest.fn(async () => [
      {
        id: "d1",
        deliveryNo: "DLV-1",
        statusCode: { code: "pending", name: "Pending" },
        branch: { name: "ABENSON ABREEZA DAVAO", sapCode: "ABP001" },
      },
    ]),
    listTransfers: jest.fn(async () => []),
    listPullouts: jest.fn(async () => []),
  },
}));

jest.mock("@/features/sap/services/sap-service-layer.service", () => ({
  sapServiceLayerService: {
    getSessionStatus: jest.fn(async () => ({ state: "idle", configId: "c1", companyDb: "X" })),
  },
}));

jest.mock("@/lib/aor/scope", () => ({
  getUserBranchIds: jest.fn(async () => ["clbranchabp00000000000001"]),
}));

jest.mock("@/lib/database/client", () => ({
  prisma: {
    branchDelivery: {
      findMany: jest.fn(async () => [
        {
          id: "d1",
          deliveryNo: "DLV-1",
          updatedAt: new Date("2026-10-01T00:00:00.000Z"),
          branch: {
            id: "clbranchabp00000000000001",
            name: "ABENSON ABREEZA DAVAO",
            sapCode: "ABP001",
          },
          statusCode: { code: "pending", name: "Pending" },
        },
      ]),
    },
  },
}));

import type { ToolExecutionOptions } from "ai";
import { monthlySirService } from "@/features/monthly-sir/services/monthly-sir.service";
import { opsService } from "@/features/ops/services/ops.service";
import { buildWorkflowOpsTools } from "@/features/pixelcare-ai/tools/workflow-ops-tools";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";
import { pcountDashboardService } from "@/features/stock-audit/services/pcount-dashboard.service";
import type { AppSession } from "@/lib/auth/session";

function sessionWithPermissions(permissions: string[]): AppSession {
  return {
    user: {
      id: "user-1",
      tenantId: "tenant-1",
      permissions,
      roleSlugs: ["tl"],
      isPlatformOperator: false,
    },
  };
}

function toolOpts(
  toolCallId: string,
): ToolExecutionOptions<Record<string, unknown>> {
  return { toolCallId, messages: [], context: {} };
}

describe("workflow-ops tools", () => {
  const prevSample = process.env.PIXELCARE_AI_SAMPLE_MODE;

  beforeEach(() => {
    process.env.PIXELCARE_AI_SAMPLE_MODE = "false";
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env.PIXELCARE_AI_SAMPLE_MODE = prevSample;
  });

  it("denies getPcountStatus without inventory.view", async () => {
    const tools = buildWorkflowOpsTools(sessionWithPermissions([]));
    const result = await tools.getPcountStatus.execute!({}, toolOpts("t1"));
    expect(result).toEqual(
      expect.objectContaining({
        error: expect.stringContaining("inventory view"),
      }),
    );
    expect(pcountDashboardService.getOverview).not.toHaveBeenCalled();
  });

  it("returns branch P-Count status when inventory.view granted", async () => {
    const tools = buildWorkflowOpsTools(
      sessionWithPermissions(["inventory.view"]),
      { defaultBranchId: "clbranchabp00000000000001" },
    );
    const result = (await tools.getPcountStatus.execute!(
      {},
      toolOpts("t2"),
    )) as Record<string, unknown>;

    expect(result.sample).toBe(false);
    expect(result.sourceHref).toContain("/inventory/stock-count");
    expect(result.sessions).toEqual([
      expect.objectContaining({ sessionNo: "PC-1", status: "in_progress" }),
    ]);
    expect(pcountDashboardService.getBranchDetail).toHaveBeenCalled();
  });

  it("lists Monthly SIR with allowance for permitted branch", async () => {
    const tools = buildWorkflowOpsTools(
      sessionWithPermissions(["inventory.view"]),
    );
    const result = (await tools.listMonthlySirStatus.execute!(
      { branchId: "ABP001" },
      toolOpts("t3"),
    )) as Record<string, unknown>;

    expect(monthlySirService.list).toHaveBeenCalled();
    expect(monthlySirService.getUploadAllowance).toHaveBeenCalled();
    expect(result.requests).toEqual([
      expect.objectContaining({
        statusLabel: "For approval",
        purpose: "October count",
      }),
    ]);
  });

  it("lists ops inbox pending deliveries", async () => {
    const tools = buildWorkflowOpsTools(
      sessionWithPermissions(["inventory.view"]),
    );
    const result = (await tools.listOpsInbox.execute!(
      {},
      toolOpts("t4"),
    )) as { deliveries: Array<{ deliveryNo: string }> };

    expect(opsService.listDeliveries).toHaveBeenCalled();
    expect(result.deliveries[0]?.deliveryNo).toBe("DLV-1");
  });

  it("finds delivery status in AOR", async () => {
    const tools = buildWorkflowOpsTools(
      sessionWithPermissions(["inventory.view"]),
    );
    const result = (await tools.findDeliveryStatus.execute!(
      { query: "DLV" },
      toolOpts("t5"),
    )) as { deliveries: Array<{ deliveryNo: string }> };

    expect(result.deliveries[0]?.deliveryNo).toBe("DLV-1");
  });

  it("gates SAP overview without sap.manage", async () => {
    const tools = buildWorkflowOpsTools(
      sessionWithPermissions(["inventory.view"]),
    );
    const result = await tools.getSapIntegrationOverview.execute!(
      {},
      toolOpts("t6"),
    );
    expect(result).toEqual(
      expect.objectContaining({
        error: expect.stringContaining("sap.manage"),
      }),
    );
    expect(sapServiceLayerService.getSessionStatus).not.toHaveBeenCalled();
  });

  it("returns SAP connection state for sap.manage without secrets", async () => {
    const tools = buildWorkflowOpsTools(
      sessionWithPermissions(["sap.manage"]),
    );
    const result = (await tools.getSapIntegrationOverview.execute!(
      {},
      toolOpts("t7"),
    )) as Record<string, unknown>;

    expect(result.connection).toEqual(
      expect.objectContaining({ state: "idle" }),
    );
    expect(JSON.stringify(result)).not.toMatch(/password|cookie|secret/i);
    expect(sapServiceLayerService.getSessionStatus).toHaveBeenCalled();
  });

  it("returns sample fixtures in sample mode", async () => {
    process.env.PIXELCARE_AI_SAMPLE_MODE = "true";
    const tools = buildWorkflowOpsTools(sessionWithPermissions([]));
    const result = (await tools.getPcountStatus.execute!(
      {},
      toolOpts("t8"),
    )) as Record<string, unknown>;
    expect(result.sample).toBe(true);
    expect(result.label).toMatch(/SAMPLE/i);
  });

  it("explainReturns aliases explainIsmsWorkflow for returns", async () => {
    const tools = buildWorkflowOpsTools(
      sessionWithPermissions(["returns.view"]),
    );
    const result = (await tools.explainReturns.execute!(
      { query: "ATR replacement" },
      toolOpts("t9"),
    )) as Record<string, unknown>;
    expect(result.truncated).not.toBe(true);
    expect(result).toEqual(
      expect.objectContaining({
        module: "returns",
        sourceHref: "/returns",
      }),
    );
    expect(result.moduleGuide).toEqual(
      expect.objectContaining({ title: expect.stringMatching(/return/i) }),
    );
  });

  it("explainIsmsWorkflow covers pcount module", async () => {
    const tools = buildWorkflowOpsTools(
      sessionWithPermissions(["inventory.view"]),
    );
    const result = (await tools.explainIsmsWorkflow.execute!(
      { module: "pcount" },
      toolOpts("t10"),
    )) as Record<string, unknown>;
    expect(result.truncated).not.toBe(true);
    expect(result).toEqual(
      expect.objectContaining({
        module: "pcount",
        sourceHref: "/inventory/stock-count",
      }),
    );
  });
});
