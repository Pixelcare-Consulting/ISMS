import type { ToolExecutionOptions } from "ai";

import { readAiAssistantGate } from "@/features/ai/services/assistant-policy.service";
import { AI_ASSISTANT_CEILINGS } from "@/features/ai/constants/assistant-limits";
import { loadOwnerAccess } from "@/features/pixelcare-ai/automations/owner-access";
import { buildPixelcareAiTools } from "@/features/pixelcare-ai/tools/registry";
import { inventoryService } from "@/features/inventory/services/inventory.service";
import { assertPermittedBranch } from "@/features/pixelcare-ai/tools/branch-access";
import type { AppSession } from "@/lib/auth/session";

jest.mock("ai", () => ({
  tool: <T,>(definition: T) => definition,
}));

jest.mock("@/features/ai/services/assistant-policy.service", () => ({
  readAiAssistantGate: jest.fn(),
}));

jest.mock("@/features/ai/lib/audit", () => ({
  logAiAction: jest.fn(async () => undefined),
}));

jest.mock("@/features/pixelcare-ai/automations/owner-access", () => ({
  loadOwnerAccess: jest.fn(),
}));

jest.mock("@/features/pixelcare-ai/tools/planning-ops-tools", () => ({
  buildPlanningOpsTools: () => ({}),
}));

jest.mock("@/features/pixelcare-ai/tools/workflow-ops-tools", () => ({
  buildWorkflowOpsTools: () => ({}),
}));

jest.mock("@/features/pixelcare-ai/tools/find-order-status", () => ({
  findOrderStatuses: jest.fn(),
}));

jest.mock("@/features/pixelcare-ai/automations/replenishment", () => ({
  prepareReplenishmentProposalForUser: jest.fn(),
}));

jest.mock("@/features/orders/services/order-analytics.service", () => ({
  orderAnalyticsService: { getAnalytics: jest.fn() },
}));

jest.mock("@/features/pixelcare-ai/tools/branch-access", () => ({
  assertPermittedBranch: jest.fn(),
  isUnrestrictedBranchAccess: () => false,
  listPermittedBranches: jest.fn(async () => []),
}));

jest.mock("@/features/inventory/services/inventory.service", () => ({
  inventoryService: {
    listGroupChildrenForUser: jest.fn(),
  },
}));

jest.mock("@/lib/auth/permissions", () => ({
  hasPermission: (permissions: string[] | undefined, permission: string) =>
    permissions?.includes(permission) ?? false,
}));

const readPolicy = readAiAssistantGate as jest.Mock;
const loadAccess = loadOwnerAccess as jest.Mock;
const branchAccess = assertPermittedBranch as jest.Mock;
const stock = inventoryService.listGroupChildrenForUser as jest.Mock;

function session(): AppSession {
  return {
    user: {
      id: "user-1",
      tenantId: "tenant-1",
      permissions: ["inventory.view"],
      roleSlugs: [],
      isPlatformOperator: false,
    },
  };
}

function toolOpts(): ToolExecutionOptions<Record<string, unknown>> {
  return { toolCallId: "call-1", messages: [], context: {} };
}

describe("sealed read tools", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    readPolicy.mockResolvedValue({ ok: true, limits: { ...AI_ASSISTANT_CEILINGS } });
    loadAccess.mockImplementation(async () => ({
      pixelcare: true,
      permissions: ["inventory.view"],
    }));
    branchAccess.mockImplementation(async (_session: AppSession, ref: string) => {
      if (ref === "branch-ok") {
        return { ok: true, branch: { id: "branch-ok", name: "Store One", sapCode: "S1" } };
      }
      return { ok: false, error: "That store is outside your area." };
    });
    stock.mockResolvedValue({
      total: 1,
      items: [
        {
          model: { sku: "SKU1", name: "Set" },
          counts: { available: 4, pendingInspection: 1, defective: 0, reserved: 2, total: 7 },
        },
      ],
    });
  });

  it("does not register confirm or an injected tool name", () => {
    const tools = buildPixelcareAiTools(session());
    expect(tools).not.toHaveProperty("confirmReplenishmentProposal");
    expect(tools).not.toHaveProperty("ignore permissions");
    expect(tools).toHaveProperty("checkBranchStock");
  });

  it("does not run the next tool step when the policy is turned off", async () => {
    const tools = buildPixelcareAiTools(session(), { maxToolSteps: 2 });
    readPolicy.mockResolvedValueOnce({ ok: false, reason: "disabled" });
    const result = await tools.checkBranchStock?.execute?.({ branchId: "branch-ok" }, toolOpts());
    expect(result).toEqual(
      expect.objectContaining({ error: expect.stringContaining("turned off") }),
    );
    expect(stock).not.toHaveBeenCalled();
  });

  it("stops after the tool step cap", async () => {
    const tools = buildPixelcareAiTools(session(), { maxToolSteps: 1 });
    await tools.checkBranchStock?.execute?.({ branchId: "branch-ok" }, toolOpts());
    const second = await tools.checkBranchStock?.execute?.({ branchId: "branch-ok" }, toolOpts());
    expect(second).toEqual(
      expect.objectContaining({ error: expect.stringContaining("too many lookups") }),
    );
    expect(stock).toHaveBeenCalledTimes(1);
  });

  it("returns quantities only for a permitted branch", async () => {
    const tools = buildPixelcareAiTools(session());
    const allowed = (await tools.checkBranchStock?.execute?.(
      { branchId: "branch-ok" },
      toolOpts(),
    )) as { items?: Array<{ skuCode: string; stkQty: number }> };
    expect(allowed.items?.[0]).toEqual(expect.objectContaining({ skuCode: "SKU1", stkQty: 5 }));
    expect(stock).toHaveBeenCalledWith(
      "tenant-1",
      "user-1",
      false,
      expect.objectContaining({ branchId: "branch-ok" }),
    );

    stock.mockClear();
    const denied = await tools.checkBranchStock?.execute?.(
      { branchId: "other-tenant-branch" },
      toolOpts(),
    );
    expect(denied).toEqual(
      expect.objectContaining({ error: expect.stringContaining("outside your area") }),
    );
    expect(stock).not.toHaveBeenCalled();
  });
});
