import {
  PIXELCARE_AI_FORBIDDEN_WRITE_TOOLS,
  PIXELCARE_AI_READ_ONLY_TOOLS,
} from "@/features/pixelcare-ai/constants/tools";
import { listPixelcareAiToolNames } from "@/features/pixelcare-ai/constants/tools-list";

const EXPECTED_READ_TOOLS = [
  "checkBranchStock",
  "explainReturns",
  "explainShelfGaps",
  "findOrderStatus",
  "findReturnStatus",
  "getCoverageMonitor",
  "getDashboardSnapshot",
  "getDemandPlanningRun",
  "getLogisticsKpis",
  "getPlanogramAlerts",
  "listAllocationGaps",
  "listBranchQuotas",
  "listDemandPlanningRuns",
  "listDraftSuggestedOrders",
  "listPermittedBranches",
].sort();

describe("pixelcare-ai tool registry", () => {
  it("registers only the allowlisted read-only tools", () => {
    expect([...PIXELCARE_AI_READ_ONLY_TOOLS].sort()).toEqual(EXPECTED_READ_TOOLS);
    expect(listPixelcareAiToolNames().sort()).toEqual(EXPECTED_READ_TOOLS);
  });

  it("does not expose write-style tool names", () => {
    const names = listPixelcareAiToolNames();
    for (const name of PIXELCARE_AI_FORBIDDEN_WRITE_TOOLS) {
      expect(names).not.toContain(name);
    }
  });
});
