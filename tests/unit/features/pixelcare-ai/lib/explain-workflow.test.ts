jest.mock("@/lib/auth/permissions", () => ({
  hasPermission: (permissions: string[] | undefined, permission: string) =>
    permissions?.includes(permission) ?? false,
}));

import {
  WORKFLOW_MODULE_MAP,
  WORKFLOW_MODULES,
  buildExplainPayload,
} from "@/features/pixelcare-ai/lib/explain-workflow";

describe("explainIsmsWorkflow helper", () => {
  it("maps every allowlisted module including pcount, monthly_sir, and sap", () => {
    expect(WORKFLOW_MODULES).toEqual(
      expect.arrayContaining(["pcount", "monthly_sir", "sap"]),
    );
    for (const workflowModule of WORKFLOW_MODULES) {
      expect(WORKFLOW_MODULE_MAP[workflowModule].sourceHref).toMatch(/^\//);
      expect(WORKFLOW_MODULE_MAP[workflowModule].defaultQuery.length).toBeGreaterThan(0);
    }
  });

  it("builds verified P-Count payload from tutorial + Help", () => {
    const payload = buildExplainPayload({
      module: "pcount",
      sampleMode: false,
      permissions: ["inventory.view"],
      retrievedAt: "2026-10-16T00:00:00.000Z",
    });

    expect(payload.error).toBeUndefined();
    expect(payload.sourceHref).toBe("/inventory/stock-count");
    expect(payload.tutorial?.title).toMatch(/P-Count|Stock count/i);
    expect(payload.tutorial?.tips.length).toBeGreaterThan(0);
    expect(payload.formatted.length).toBeGreaterThan(0);
    expect(payload.limitation).toMatch(/getPcountStatus/i);
  });

  it("builds Monthly SIR payload from tutorial", () => {
    const payload = buildExplainPayload({
      module: "monthly_sir",
      query: "how do I upload",
      sampleMode: false,
      permissions: ["inventory.view"],
      retrievedAt: "2026-10-16T00:00:00.000Z",
    });

    expect(payload.error).toBeUndefined();
    expect(payload.sourceHref).toBe("/inventory/monthly-sir");
    expect(payload.tutorial?.title).toMatch(/Monthly SIR/i);
    expect(payload.limitation).toMatch(/listMonthlySirStatus/i);
  });

  it("builds SAP payload with Help FAQ and no invented credentials", () => {
    const payload = buildExplainPayload({
      module: "sap",
      sampleMode: false,
      permissions: [],
      retrievedAt: "2026-10-16T00:00:00.000Z",
    });

    expect(payload.error).toBeUndefined();
    expect(payload.sourceHref).toBe("/settings/sap-integration");
    expect(payload.helpHits.length).toBeGreaterThan(0);
    expect(payload.limitation).toMatch(/credentials|IDoc|API/i);
    expect(JSON.stringify(payload)).not.toMatch(/password|secret|cookie/i);
  });

  it("gates inventory modules without inventory.view outside sample mode", () => {
    const payload = buildExplainPayload({
      module: "pcount",
      sampleMode: false,
      permissions: [],
      retrievedAt: "2026-10-16T00:00:00.000Z",
    });
    expect(payload.error).toMatch(/outside your access/i);
    expect(payload.error).toMatch(/\/inventory\/stock-count/);
    expect(payload.error).not.toMatch(/Open Help/i);
  });

  it("keeps user-facing limitations operational (no Help-only framing)", () => {
    for (const workflowModule of ["sales", "reports", "service_centers", "policies"] as const) {
      const limitation = WORKFLOW_MODULE_MAP[workflowModule].limitation;
      expect(limitation).not.toMatch(/Verified Help/i);
      expect(limitation).not.toMatch(/tutorials only/i);
      expect(limitation).not.toMatch(/corpus/i);
    }
    expect(WORKFLOW_MODULE_MAP.sales.limitation).toMatch(/open Sales/i);
    expect(WORKFLOW_MODULE_MAP.reports.limitation).toMatch(/Reports screens/i);
    expect(WORKFLOW_MODULE_MAP.policies.limitation).toMatch(/open Policies/i);
  });
});
